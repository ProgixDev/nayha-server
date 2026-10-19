-- These tables were readable and writable with the app's public key because
-- RLS was off (Supabase advisor: "RLS Disabled in Public"). Coaching sessions
-- and messages hold users' conversations. Only the API, with the service
-- role, uses them, so RLS is enabled without any policy.
ALTER TABLE IF EXISTS public.coaching_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.coaching_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.app_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.rome_competences ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.rome_metiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.rome_fiches_metiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.rome_contextes_travail ENABLE ROW LEVEL SECURITY;
