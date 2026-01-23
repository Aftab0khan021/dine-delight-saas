-- Phase 8: Support Tools - Database Schema
-- Migration: Add error logging and enhance support tickets

-- ============================================================
-- 1. ENHANCE SUPPORT_TICKETS TABLE
-- ============================================================

-- Add SLA tracking fields
ALTER TABLE support_tickets
ADD COLUMN IF NOT EXISTS sla_due_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS sla_breached BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS response_time_minutes INTEGER,
ADD COLUMN IF NOT EXISTS resolution_time_minutes INTEGER,
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Create index for SLA monitoring
CREATE INDEX IF NOT EXISTS idx_support_tickets_sla
ON support_tickets(sla_breached, sla_due_at) WHERE status IN ('open', 'in_progress');

-- Create index for tags
CREATE INDEX IF NOT EXISTS idx_support_tickets_tags
ON support_tickets USING GIN(tags);

-- ============================================================
-- 2. CREATE ERROR_LOGS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  error_type TEXT NOT NULL CHECK (
    error_type IN ('api', 'auth', 'payment', 'system', 'database', 'validation')
  ),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (
    severity IN ('low', 'medium', 'high', 'critical')
  ),
  message TEXT NOT NULL,
  endpoint TEXT,
  method TEXT,
  status_code INTEGER,
  user_id UUID REFERENCES auth.users(id),
  restaurant_id UUID REFERENCES restaurants(id),
  ip_address TEXT,
  user_agent TEXT,
  stack_trace TEXT,
  metadata JSONB DEFAULT '{}',
  status TEXT DEFAULT 'new' CHECK (
    status IN ('new', 'investigating', 'resolved', 'ignored')
  ),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_error_logs_type_severity
ON error_logs(error_type, severity, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_error_logs_endpoint
ON error_logs(endpoint, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_error_logs_user
ON error_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_error_logs_restaurant
ON error_logs(restaurant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_error_logs_status
ON error_logs(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_error_logs_created
ON error_logs(created_at DESC);

-- Enable RLS
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

-- Super admin can manage all error logs
CREATE POLICY error_logs_super_admin_all
ON error_logs FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- ============================================================
-- 3. CREATE TICKET_COMMENTS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS ticket_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  comment_text TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket
ON ticket_comments(ticket_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_ticket_comments_user
ON ticket_comments(user_id, created_at DESC);

-- Enable RLS
ALTER TABLE ticket_comments ENABLE ROW LEVEL SECURITY;

-- Super admin can manage all comments
CREATE POLICY ticket_comments_super_admin_all
ON ticket_comments FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Restaurant admins can view non-internal comments on their tickets
CREATE POLICY ticket_comments_view_own
ON ticket_comments FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM support_tickets st
    WHERE st.id = ticket_comments.ticket_id
    AND public.has_restaurant_access(auth.uid(), st.restaurant_id)
    AND (ticket_comments.is_internal = false OR public.has_role(auth.uid(), 'super_admin'))
  )
);

-- Restaurant admins can create comments on their tickets
CREATE POLICY ticket_comments_create_own
ON ticket_comments FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM support_tickets st
    WHERE st.id = ticket_comments.ticket_id
    AND public.has_restaurant_access(auth.uid(), st.restaurant_id)
  )
  AND user_id = auth.uid()
  AND is_internal = false
);

-- ============================================================
-- 4. HELPER FUNCTIONS
-- ============================================================

-- Function to calculate SLA due date
CREATE OR REPLACE FUNCTION calculate_sla_due_at(
  p_created_at TIMESTAMPTZ,
  p_priority TEXT
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_sla_minutes INTEGER;
BEGIN
  -- SLA times by priority
  v_sla_minutes := CASE p_priority
    WHEN 'urgent' THEN 120    -- 2 hours
    WHEN 'high' THEN 480      -- 8 hours
    WHEN 'medium' THEN 1440   -- 24 hours
    WHEN 'low' THEN 4320      -- 72 hours
    ELSE 1440                 -- default 24 hours
  END;
  
  RETURN p_created_at + (v_sla_minutes || ' minutes')::INTERVAL;
END;
$$;

-- Function to update SLA status
CREATE OR REPLACE FUNCTION update_ticket_sla()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Calculate SLA due date if not set
  IF NEW.sla_due_at IS NULL THEN
    NEW.sla_due_at := calculate_sla_due_at(NEW.created_at, NEW.priority);
  END IF;
  
  -- Update SLA breached status
  IF NEW.status IN ('open', 'in_progress') THEN
    NEW.sla_breached := NOW() > NEW.sla_due_at;
  END IF;
  
  -- Calculate resolution time when resolved
  IF NEW.status IN ('resolved', 'closed') AND OLD.status NOT IN ('resolved', 'closed') THEN
    NEW.resolved_at := NOW();
    NEW.resolution_time_minutes := EXTRACT(EPOCH FROM (NOW() - NEW.created_at)) / 60;
  END IF;
  
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- Create trigger for SLA updates
DROP TRIGGER IF EXISTS trigger_update_ticket_sla ON support_tickets;
CREATE TRIGGER trigger_update_ticket_sla
BEFORE INSERT OR UPDATE ON support_tickets
FOR EACH ROW
EXECUTE FUNCTION update_ticket_sla();

-- Function to log errors
CREATE OR REPLACE FUNCTION log_error(
  p_error_type TEXT,
  p_severity TEXT,
  p_message TEXT,
  p_endpoint TEXT DEFAULT NULL,
  p_method TEXT DEFAULT NULL,
  p_status_code INTEGER DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_restaurant_id UUID DEFAULT NULL,
  p_stack_trace TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_error_id UUID;
BEGIN
  INSERT INTO error_logs (
    error_type,
    severity,
    message,
    endpoint,
    method,
    status_code,
    user_id,
    restaurant_id,
    stack_trace,
    metadata
  ) VALUES (
    p_error_type,
    p_severity,
    p_message,
    p_endpoint,
    p_method,
    p_status_code,
    p_user_id,
    p_restaurant_id,
    p_stack_trace,
    p_metadata
  )
  RETURNING id INTO v_error_id;
  
  RETURN v_error_id;
END;
$$;

-- ============================================================
-- 5. VIEWS FOR REPORTING
-- ============================================================

-- View: Ticket SLA Summary
CREATE OR REPLACE VIEW ticket_sla_summary AS
SELECT 
  status,
  priority,
  COUNT(*) as ticket_count,
  COUNT(*) FILTER (WHERE sla_breached = true) as breached_count,
  COUNT(*) FILTER (WHERE sla_breached = false AND NOW() > sla_due_at - INTERVAL '2 hours') as at_risk_count,
  AVG(resolution_time_minutes) FILTER (WHERE resolution_time_minutes IS NOT NULL) as avg_resolution_minutes
FROM support_tickets
WHERE status IN ('open', 'in_progress', 'resolved', 'closed')
GROUP BY status, priority;

-- View: Error Summary
CREATE OR REPLACE VIEW error_summary AS
SELECT 
  error_type,
  severity,
  COUNT(*) as error_count,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as errors_24h,
  COUNT(*) FILTER (WHERE status = 'new') as unresolved_count,
  MAX(created_at) as last_occurrence
FROM error_logs
GROUP BY error_type, severity;

-- ============================================================
-- COMMENTS
-- ============================================================

COMMENT ON TABLE error_logs IS 'System error logging for monitoring and debugging';
COMMENT ON TABLE ticket_comments IS 'Comments and updates on support tickets';
COMMENT ON COLUMN support_tickets.sla_due_at IS 'When the SLA expires for this ticket';
COMMENT ON COLUMN support_tickets.sla_breached IS 'Whether the SLA has been breached';
COMMENT ON COLUMN support_tickets.resolution_time_minutes IS 'Time taken to resolve the ticket in minutes';
COMMENT ON FUNCTION calculate_sla_due_at IS 'Calculate SLA due date based on priority';
COMMENT ON FUNCTION log_error IS 'Helper function to log errors from application code';
