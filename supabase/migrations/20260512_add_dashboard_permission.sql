-- ============================================================================
-- Add view_dashboard permission
-- ============================================================================
-- Allows gating Dashboard access for staff members

INSERT INTO public.permissions (id, code, name, description, category)
VALUES (gen_random_uuid(), 'view_dashboard', 'View Dashboard', 'Can view the admin dashboard with KPIs and quick actions', 'settings')
ON CONFLICT (code) DO NOTHING;
