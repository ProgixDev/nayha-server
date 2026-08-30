-- Seed realistic diagnostic data for testing Portrait de Force generation
-- Uses exact values from AppConstants chip/option lists
UPDATE user_profiles
SET
  diagnostic_vie_data = '{"name":"Salomé","age":"38","city":"Lyon","situation":"En pause parentale","roles":["Mère","Aidante","Organisatrice","Bénévole","Gestionnaire du foyer"],"hiddenSuccess":"J''ai coordonné seule le déménagement de toute ma famille dans une nouvelle ville, trouvé les écoles, le logement, les médecins, tout en gérant le stress de tout le monde.","naturalStrength":"Je sais calmer les situations tendues. Quand tout le monde panique, je reste celle qui trouve une solution.","overcomeChallenge":"Quand mon mari a perdu son emploi, j''ai pris en charge toute l''organisation familiale et financière pendant un an. J''ai appris à budgétiser au centime près et négocier avec la banque.","vision":"Je veux retrouver un travail qui a du sens, où je peux aider les gens. J''aimerais travailler dans le social ou la coordination."}'::jsonb,
  diagnostic_pro_data = '{"educationLevel":"Bac +2 (BTS / DUT / DEUST)","educationDomains":["Gestion / Finance / Comptabilité","Santé / Social / Paramédical"],"workExperiences":"5 ans assistante de direction dans une PME industrielle (agenda, facturation, relances, réunions). 2 ans secrétariat médical (accueil patients, planning, tiers payant).","energySources":"Aider les gens à résoudre leurs problèmes, organiser, former quelqu''un, travailler en équipe.","dealbreakers":"Travailler seule sans contact humain, mépris, pas de sens, horaires incompatibles avec mes enfants.","idealDayVision":"Point avec l''équipe le matin, accompagner des personnes, monter des dossiers, coordonner avec les partenaires sociaux, suivi admin l''après-midi, départ 17h."}'::jsonb,
  diagnostic_vie_completed = true,
  diagnostic_pro_completed = true,
  reports_completed = false
WHERE id = (SELECT id FROM user_profiles LIMIT 1);
