CREATE TABLE IF NOT EXISTS app_links (
  key TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  module TEXT NOT NULL,
  step TEXT NOT NULL DEFAULT '',
  organisme TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  default_url TEXT NOT NULL,
  current_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default links
INSERT INTO app_links (key, title, module, step, organisme, description, default_url, current_url, updated_at)
VALUES
  ('reconversion_financement_cpf', 'Mon Compte Formation (CPF)', 'Reconversion', 'Étape 5 · Financement', 'Caisse des Dépôts', 'Portail officiel pour consulter son solde CPF et s''inscrire à une formation certifiante.', 'https://www.moncompteformation.gouv.fr', 'https://www.moncompteformation.gouv.fr', NOW()),
  ('reconversion_financement_ptp', 'Projet de Transition Professionnelle (PTP CDI)', 'Reconversion', 'Étape 5 · Financement', 'Transitions Pro', 'Prise en charge de formation longue et maintien de salaire pour salariés en CDI.', 'https://www.transitionspro.fr', 'https://www.transitionspro.fr', NOW()),
  ('reconversion_financement_ptp_cdd', 'Projet de Transition Professionnelle (PTP CDD)', 'Reconversion', 'Étape 5 · Financement', 'Transitions Pro', 'Dispositif PTP accessible pendant ou à l''issue d''un contrat à durée déterminée.', 'https://www.transitionspro.fr', 'https://www.transitionspro.fr', NOW()),
  ('reconversion_financement_opco', 'Financement OPCO', 'Reconversion', 'Étape 5 · Financement', 'OPCO', 'Financement des formations via l''employeur dans le cadre du plan de développement des compétences.', 'https://www.opco.fr', 'https://www.opco.fr', NOW()),
  ('reconversion_financement_demission', 'Dispositif Démission-Reconversion', 'Reconversion', 'Étape 5 · Financement', 'France Travail + Transitions Pro', 'Dispositif pour démissionner et bénéficier de l''ARE pour un projet de reconversion réel et sérieux.', 'https://demission-reconversion.gouv.fr', 'https://demission-reconversion.gouv.fr', NOW()),
  ('reconversion_financement_aif', 'Aide Individuelle à la Formation (AIF)', 'Reconversion', 'Étape 5 · Financement', 'France Travail', 'Prise en charge France Travail des frais pédagogiques de formation restants.', 'https://www.francetravail.fr/candidat/en-formation/mes-aides-financieres/laide-individuelle-a-la-formatio.html', 'https://www.francetravail.fr/candidat/en-formation/mes-aides-financieres/laide-individuelle-a-la-formatio.html', NOW()),
  ('reconversion_financement_aref', 'Allocation de Retour à l''Emploi Formation (ARE-F)', 'Reconversion', 'Étape 5 · Financement', 'France Travail', 'Maintien des allocations chômage sous forme d''AREF pendant toute la formation validée au PPAE.', 'https://www.francetravail.fr/candidat/en-formation/les-dispositifs/lallocation-daide-au-retour-a-le.html', 'https://www.francetravail.fr/candidat/en-formation/les-dispositifs/lallocation-daide-au-retour-a-le.html', NOW()),
  ('reconversion_financement_poei', 'POEI / AFPR (Formation pré-embauche)', 'Reconversion', 'Étape 5 · Financement', 'France Travail + Employeur', 'Préparation opérationnelle à l''emploi individuelle financée avec promesse de recrutement.', 'https://www.francetravail.fr/employeur/aides-aux-recrutements/les-aides-a-la-formation/la-preparation-operationnelle-a.html', 'https://www.francetravail.fr/employeur/aides-aux-recrutements/les-aides-a-la-formation/la-preparation-operationnelle-a.html', NOW()),
  ('reconversion_financement_region', 'Financement Conseil Régional (Non indemnisés)', 'Reconversion', 'Étape 5 · Financement', 'Conseil Régional / ASP', 'Prise en charge de formations conventionnées pour demandeurs d''emploi non indemnisés.', 'https://www.service-public.fr/particuliers/vosdroits/F2401', 'https://www.service-public.fr/particuliers/vosdroits/F2401', NOW()),
  ('reconversion_financement_rfft', 'Rémunération de Formation (RFFT / R2F)', 'Reconversion', 'Étape 5 · Financement', 'Région / ASP', 'Rémunération mensuelle versée aux stagiaires de la formation professionnelle conventionnée Région.', 'https://www.service-public.gouv.fr/particuliers/vosdroits/F292?lang=fr', 'https://www.service-public.gouv.fr/particuliers/vosdroits/F292?lang=fr', NOW()),
  ('reconversion_financement_agefice', 'AGEFICE (Commerce & Non réglementé)', 'Reconversion', 'Étape 5 · Financement', 'AGEFICE', 'Fonds d''assurance formation pour les commerçants et dirigeants non salariés.', 'https://agefice.info/', 'https://agefice.info/', NOW()),
  ('reconversion_financement_fifpl', 'FIF-PL (Professions Libérales)', 'Reconversion', 'Étape 5 · Financement', 'FIF-PL', 'Fonds d''assurance formation pour les professions libérales et indépendants CIPAV.', 'https://www.fifpl.fr', 'https://www.fifpl.fr', NOW()),
  ('reconversion_financement_fafcea', 'FAFCEA (Artisans)', 'Reconversion', 'Étape 5 · Financement', 'FAFCEA', 'Fonds d''assurance formation des chefs d''entreprises artisanales.', 'https://www.fafcea.com', 'https://www.fafcea.com', NOW()),
  ('reconversion_financement_faf_generic', 'FAF (Identification FAF Indépendants)', 'Reconversion', 'Étape 5 · Financement', 'Service-Public', 'Guide officiel pour identifier son FAF selon son code d''activité.', 'https://www.service-public.fr/professionnels-entreprises/vosdroits/F31148', 'https://www.service-public.fr/professionnels-entreprises/vosdroits/F31148', NOW()),
  ('reconversion_financement_public_cfp', 'Congé de Formation Professionnelle (CFP Public)', 'Reconversion', 'Étape 5 · Financement', 'Administration / CNFPT / ANFH', 'Congé de formation avec maintien partiel de traitement pour agents publics.', 'https://www.service-public.fr/particuliers/vosdroits/F14018', 'https://www.service-public.fr/particuliers/vosdroits/F14018', NOW()),
  ('reconversion_financement_public_plan', 'Plan de formation Fonction Publique', 'Reconversion', 'Étape 5 · Financement', 'Administration employeur', 'Prise en charge de formation continue dans le cadre du plan annuel d''administration.', 'https://www.service-public.fr/particuliers/vosdroits/F3019', 'https://www.service-public.fr/particuliers/vosdroits/F3019', NOW()),
  ('reconversion_financement_alternance', 'Contrat d''Alternance / Apprentissage', 'Reconversion', 'Étape 5 · Financement', 'Ministère du Travail', 'Dispositif de formation gratuite rémunérée en entreprise (apprentissage / professionnalisation).', 'https://www.service-public.fr/particuliers/vosdroits/F2918', 'https://www.service-public.fr/particuliers/vosdroits/F2918', NOW()),
  ('reconversion_immersion_facile', 'Immersion Facilitée (PMSMP)', 'Reconversion', 'Étape 3 · Immersion', 'Beta.gouv / France Travail', 'Plateforme nationale pour conventionner une période de stage d''immersion professionnelle en entreprise.', 'https://immersion-facile.beta.gouv.fr/', 'https://immersion-facile.beta.gouv.fr/', NOW()),
  ('reconversion_cep', 'Mon Conseil en Évolution Professionnelle', 'Reconversion', 'Général', 'Mon CEP', 'Service gratuit d''accompagnement et d''orientation professionnelle.', 'https://mon-cep.org', 'https://mon-cep.org', NOW()),
  ('creation_formalites_entreprises', 'Guichet Unique Formalités Entreprises', 'Création d''activité', 'Étape 6 · Démarches', 'INPI', 'Guichet unique obligatoire pour l''immatriculation de toute entreprise en France.', 'https://formalites.entreprises.gouv.fr', 'https://formalites.entreprises.gouv.fr', NOW()),
  ('creation_autoentrepreneur_urssaf', 'Portail Auto-Entrepreneur URSSAF', 'Création d''activité', 'Étape 6 · Démarches', 'URSSAF', 'Portail officiel de gestion et de déclaration du chiffre d''affaires micro-entrepreneur.', 'https://www.autoentrepreneur.urssaf.fr', 'https://www.autoentrepreneur.urssaf.fr', NOW())
ON CONFLICT (key) DO UPDATE SET
  title = EXCLUDED.title,
  module = EXCLUDED.module,
  step = EXCLUDED.step,
  organisme = EXCLUDED.organisme,
  description = EXCLUDED.description,
  default_url = EXCLUDED.default_url;
