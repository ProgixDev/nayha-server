-- Real immersion videos (PMSMP / Immersion Facilitée), one per step of the
-- reconversion immersion journey. The steps without a matching video are
-- turned off rather than shown with an unrelated one.

-- « Préparer ma demande »: what an immersion brings in a reconversion.
UPDATE ateliers SET
  titre = 'Découvrir un nouveau métier avec l’immersion',
  subtitle = 'Pourquoi faire une immersion',
  duree = '01:19',
  description = 'Comment Immersion Facilitée permet, en reconversion professionnelle, de découvrir un nouveau métier sur le terrain avant de s’engager.',
  video_url = 'https://youtu.be/Jp6i3zg4BFk',
  objectifs = ARRAY[
    'Comprendre ce qu’apporte une immersion en reconversion.',
    'Voir comment découvrir un métier sans engagement.'
  ],
  is_active = TRUE,
  updated_at = NOW()
WHERE id = 'comprendre_pmsmp';

-- « Tu peux faire ta demande »: doing the request.
UPDATE ateliers SET
  titre = 'Faire ta demande d’immersion en 3 clics',
  subtitle = 'Faire ma demande',
  duree = '00:46',
  description = 'Le tutoriel pas à pas pour demander une immersion professionnelle (PMSMP) en quelques clics.',
  video_url = 'https://youtu.be/KJ2_LnIk41c',
  objectifs = ARRAY[
    'Trouver où faire la demande d’immersion.',
    'Remplir la demande pas à pas.'
  ],
  is_active = TRUE,
  updated_at = NOW()
WHERE id = 'preparer_echange';

-- « Tu attends une réponse »: what happens on the company's side.
UPDATE ateliers SET
  titre = 'Comment l’entreprise accueille une immersion',
  subtitle = 'Côté entreprise',
  duree = '01:56',
  description = 'Le pas-à-pas suivi par l’entreprise pour accueillir un candidat en immersion professionnelle : utile pour savoir ce qui se passe de son côté, et la rassurer si besoin.',
  video_url = 'https://youtu.be/gS_0-IUNg6g',
  objectifs = ARRAY[
    'Comprendre les étapes suivies par l’entreprise.',
    'Savoir quoi lui expliquer si elle hésite.'
  ],
  is_active = TRUE,
  updated_at = NOW()
WHERE id = 'grille_observation';

-- No matching video yet: hidden in the app until one is added.
UPDATE ateliers SET
  is_active = FALSE,
  video_url = '',
  updated_at = NOW()
WHERE id IN ('reussir_immersion', 'poser_questions');
