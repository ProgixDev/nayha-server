-- CV identity: dedicated CV photo + contact block shown on generated CVs.
-- cv_identity shape: { email, phone, city, linkedin, permis, photoMode }
-- photoMode: 'none' | 'avatar' | 'custom'
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS cv_photo_url TEXT,
ADD COLUMN IF NOT EXISTS cv_identity JSONB;
