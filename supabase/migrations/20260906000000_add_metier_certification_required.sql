-- Store the required certification/diploma name identified from lacunes (categorie='diplome', niveau='obligatoire')
-- Populated by the mobile app when user taps "Je choisis ce métier" on the fiche métier page.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS selected_metier_certification_required text;
