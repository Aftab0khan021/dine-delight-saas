-- Add IP address tracking to staff_invites for rate limiting
ALTER TABLE public.staff_invites 
ADD COLUMN IF NOT EXISTS ip_address TEXT;

-- Add index for IP-based rate limiting queries
CREATE INDEX IF NOT EXISTS staff_invites_ip_created_idx 
ON public.staff_invites (ip_address, created_at DESC) 
WHERE ip_address IS NOT NULL;

COMMENT ON COLUMN public.staff_invites.ip_address IS 'IP address of the user who created the invite (for rate limiting)';
