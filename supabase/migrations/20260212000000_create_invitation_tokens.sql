-- Custom Invitation System - Database Schema
-- Creates invitation_tokens table for secure, time-limited staff invitations

-- Create invitation_tokens table
CREATE TABLE IF NOT EXISTS invitation_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  staff_category_id UUID REFERENCES staff_categories(id) ON DELETE SET NULL,
  role app_role NOT NULL DEFAULT 'user',
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_invitation_tokens_token ON invitation_tokens(token);
CREATE INDEX IF NOT EXISTS idx_invitation_tokens_email ON invitation_tokens(email);
CREATE INDEX IF NOT EXISTS idx_invitation_tokens_expires_at ON invitation_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_invitation_tokens_restaurant ON invitation_tokens(restaurant_id);

-- Enable RLS
ALTER TABLE invitation_tokens ENABLE ROW LEVEL SECURITY;

-- Policy: Restaurant admins can view their own restaurant's invitations
CREATE POLICY "Restaurant admins can view own invitations"
  ON invitation_tokens
  FOR SELECT
  USING (
    restaurant_id IN (
      SELECT restaurant_id 
      FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'restaurant_admin'
    )
  );

-- Policy: Restaurant admins can create invitations for their restaurant
CREATE POLICY "Restaurant admins can create invitations"
  ON invitation_tokens
  FOR INSERT
  WITH CHECK (
    restaurant_id IN (
      SELECT restaurant_id 
      FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'restaurant_admin'
    )
  );

-- Policy: Anyone can verify tokens (needed for public invitation acceptance)
CREATE POLICY "Anyone can verify tokens"
  ON invitation_tokens
  FOR SELECT
  USING (
    used_at IS NULL 
    AND expires_at > NOW()
  );

-- Policy: System can mark tokens as used (via service role)
CREATE POLICY "Service role can update tokens"
  ON invitation_tokens
  FOR UPDATE
  USING (true);

-- Function to cleanup expired tokens (optional, for maintenance)
CREATE OR REPLACE FUNCTION cleanup_expired_invitation_tokens()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM invitation_tokens
  WHERE expires_at < NOW() - INTERVAL '7 days';
END;
$$;

-- Comment on table
COMMENT ON TABLE invitation_tokens IS 'Stores secure, time-limited invitation tokens for staff invitations. Tokens expire after 30 minutes and are single-use only.';
