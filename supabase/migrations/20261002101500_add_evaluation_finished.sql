-- Shared completion state for the mandatory métier evaluation. It applies to
-- every journey, unlike the former return-to-work-specific column.
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS evaluation_finished boolean NOT NULL DEFAULT false;

-- Preserve completion for users who finished before the shared field existed.
UPDATE public.user_profiles
SET evaluation_finished = true
WHERE retour_emploi_evaluation_completed = true;
