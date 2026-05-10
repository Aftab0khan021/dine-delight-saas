-- Add staff_category_id to staff_invites so pending invites show their category
ALTER TABLE public.staff_invites
ADD COLUMN IF NOT EXISTS staff_category_id UUID REFERENCES public.staff_categories(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.staff_invites.staff_category_id IS 'Staff category assigned at invite time';
