-- Legal pages shown on the paywall (required by Apple) and in "Tes données".
-- The admin can only edit existing links, so they are created here.
INSERT INTO public.app_links
  (key, title, module, step, organisme, description, default_url, current_url, updated_at)
VALUES
  (
    'legal_privacy',
    'Politique de confidentialité',
    'Légal',
    'Abonnement · Données',
    'NAYHA',
    'Page publique de la politique de confidentialité, ouverte depuis l''écran d''abonnement et « Tes données ».',
    'https://naya-landing-green.vercel.app/confidentialite',
    'https://naya-landing-green.vercel.app/confidentialite',
    now()
  ),
  (
    'legal_terms',
    'Conditions d''utilisation',
    'Légal',
    'Abonnement',
    'NAYHA',
    'Page publique des conditions d''utilisation, ouverte depuis l''écran d''abonnement.',
    'https://naya-landing-green.vercel.app/cgu',
    'https://naya-landing-green.vercel.app/cgu',
    now()
  )
ON CONFLICT (key) DO NOTHING;
