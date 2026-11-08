-- Every video of the app comes from this table: the videos that were written
-- in the mobile code become ateliers the team manages from the console.
-- Existing rows are left untouched (an admin may already have edited them).

-- No placeholder video: an atelier without a video simply has none.
ALTER TABLE ateliers ALTER COLUMN video_url SET DEFAULT '';
ALTER TABLE ateliers ALTER COLUMN duree SET DEFAULT '';

INSERT INTO ateliers (
  id, titre, subtitle, palier, palier_label, category, step_tag, duree,
  description, video_url, objectifs, tips, icon, "order", is_active
) VALUES
  -- Reconversion › immersion: one atelier per screen of the journey
  -- (preparing the request, then request sent, waiting, scheduled, in progress).
  -- comprendre_pmsmp: its link is a placeholder unrelated to the PMSMP —
  -- replace it in the console with the real video, and its duration.
  (
    'comprendre_pmsmp',
    'Comprendre et préparer une immersion PMSMP',
    'Immersion métier',
    'palier_2',
    'Palier 2 - Explorer',
    'reconversion',
    'Immersion & Entretien',
    '09:57',
    'Découvre comment fonctionne la Période de Mise en Situation en Milieu Professionnel (PMSMP) : convention officielle, couverture sociale et démarches auprès de ton conseiller.',
    'https://youtu.be/APSJLWXbsJk',
    ARRAY[
      'Comprendre le cadre légal et la couverture d’une convention PMSMP.',
      'Identifier le bon prescripteur (France Travail, Cap Emploi, Mission Locale).',
      'Définir la durée idéale pour observer le métier (1 jour à 1 mois).'
    ],
    '{}',
    'video',
    50,
    TRUE
  ),
  -- Retour à l'emploi › analyse des offres (« Où chercher des offres »).
  (
    'ou_chercher_offres',
    'Où chercher des offres',
    'Les bons sites pour ton métier',
    'palier_1',
    'Recherche d''emploi',
    'emploi',
    'Candidatures & Veille',
    '05:00',
    'Avant de coller tes offres, découvre les meilleurs endroits pour les trouver : les job boards généralistes (France Travail, Indeed, LinkedIn), les sites spécialisés par secteur, et les plateformes à connaître pour ton métier.',
    'https://youtu.be/A6VSW2A95bI',
    ARRAY[
      'Connaître les plateformes généralistes incontournables',
      'Identifier les sites spécialisés de ton secteur',
      'Mettre en place des alertes pour gagner du temps'
    ],
    '{}',
    'video',
    51,
    TRUE
  ),
  -- Retour à l'emploi › simulation d'entretien.
  (
    'entretien-etapes',
    'Les étapes d''un entretien',
    'Simulation d''entretien',
    'palier_2',
    'Entretien',
    'emploi',
    'Simulation d''entretien',
    '',
    'Les étapes clés pour te préparer, répondre avec clarté et terminer ton entretien sereinement.',
    'https://youtu.be/IGvtp-ftf6Q',
    '{}',
    '{}',
    'video',
    52,
    TRUE
  ),
  (
    'entretien-posture',
    'La posture en entretien',
    'Simulation d''entretien',
    'palier_2',
    'Entretien',
    'emploi',
    'Simulation d''entretien',
    '',
    'Les bons réflexes de posture et de présence pour inspirer confiance dès les premières minutes.',
    'https://youtu.be/5XLeXjhkZwg',
    '{}',
    '{}',
    'video',
    53,
    TRUE
  ),
  (
    'negocier-salaire',
    'Négocier son salaire',
    'Simulation d''entretien',
    'palier_2',
    'Entretien',
    'emploi',
    'Simulation d''entretien',
    '',
    'Prépare tes arguments et aborde la question du salaire avec une posture claire et assurée.',
    'https://youtu.be/yT_DKvUdDAQ',
    '{}',
    '{}',
    'video',
    54,
    TRUE
  ),
  (
    'questions-recruteur',
    'Les questions à poser au recruteur',
    'Simulation d''entretien',
    'palier_2',
    'Entretien',
    'emploi',
    'Simulation d''entretien',
    '',
    'Les questions utiles à poser pour mieux comprendre le poste, l’équipe et la suite du processus.',
    'https://youtu.be/apnzELyRGfs',
    '{}',
    '{}',
    'video',
    55,
    TRUE
  ),
  (
    'preparer_echange',
    'Contacter l’entreprise & signer la convention',
    'Préparer un premier échange',
    'palier_2',
    'Palier 2 - Explorer',
    'reconversion',
    'Immersion & Entretien',
    '05:00',
    'Comment solliciter une entreprise pour une immersion d’observation, rassurer le responsable et faire signer la convention dématérialisée.',
    'https://youtu.be/rUcNEnF_7ZE',
    ARRAY[
      'Présenter ton projet de reconversion avec professionnalisme.',
      'Rassurer l’entreprise sur la gratuité et l’absence d’engagement.',
      'Utiliser le service dématérialisé Immersion Facilitée.'
    ],
    '{}',
    'video',
    56,
    TRUE
  ),
  (
    'grille_observation',
    'Préparer sa grille d’observation terrain',
    'Que regarder sur le terrain',
    'palier_2',
    'Palier 2 - Explorer',
    'reconversion',
    'Immersion & Entretien',
    '06:00',
    'Ce qu’il faut observer sans filtre pendant tes journées d’immersion : rythme, logiciels, ambiance et contraintes réelles du poste.',
    'https://youtu.be/VPjLkfufXDQ',
    ARRAY[
      'Lister les points clés à observer au quotidien.',
      'Identifier les questions incontournables à poser au tuteur.',
      'Prendre des notes discrètes pour nourrir ton bilan de reconversion.'
    ],
    '{}',
    'video',
    57,
    TRUE
  ),
  (
    'reussir_immersion',
    'Réussir ses premiers pas en immersion',
    'Réussir mon immersion',
    'palier_2',
    'Palier 2 - Explorer',
    'reconversion',
    'Immersion & Entretien',
    '05:00',
    'Conseils pour adopter la bonne posture dès le premier jour, bien t’intégrer dans l’équipe et tirer le maximum d’enseignements de ton stage.',
    'https://youtu.be/IlzoLag7CEA',
    ARRAY[
      'Soigner sa présentation et sa curiosité bienveillante.',
      'Observer sans gêner le flux de travail de l’équipe.',
      'Repérer les compétences et gestes professionnels indispensables.'
    ],
    '{}',
    'video',
    58,
    TRUE
  ),
  (
    'poser_questions',
    'Échanger avec les professionnels du métier',
    'Poser les bonnes questions',
    'palier_2',
    'Palier 2 - Explorer',
    'reconversion',
    'Immersion & Entretien',
    '04:00',
    'Les vraies questions à poser sur les salaires réels, les difficultés quotidiennes, le recrutement et les meilleures écoles ou certifications.',
    'https://youtu.be/8R5pnhK0f6o',
    ARRAY[
      'Questionner sur les parcours d’accès des collaborateurs.',
      'Demander quelles formations sont réellement reconnues par les recruteurs.',
      'Créer un premier lien réseau pour un futur stage ou emploi.'
    ],
    '{}',
    'video',
    59,
    TRUE
  )
ON CONFLICT (id) DO NOTHING;
