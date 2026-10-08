-- 1. Create table if not exists
CREATE TABLE IF NOT EXISTS ateliers (
  id TEXT PRIMARY KEY,
  titre TEXT NOT NULL,
  subtitle TEXT,
  palier TEXT NOT NULL DEFAULT 'palier_1',
  palier_label TEXT,
  category TEXT NOT NULL DEFAULT 'emploi',
  step_tag TEXT DEFAULT '',
  duree TEXT NOT NULL DEFAULT '15:00',
  description TEXT DEFAULT '',
  video_url TEXT DEFAULT 'https://youtu.be/6A1xfGvUFgk',
  objectifs TEXT[] DEFAULT '{}',
  tips TEXT[] DEFAULT '{}',
  resource_url TEXT DEFAULT '',
  speaker_name TEXT DEFAULT '',
  speaker_role TEXT DEFAULT '',
  icon TEXT DEFAULT 'notifications',
  accent_color TEXT DEFAULT '#D4A574',
  "order" INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  views_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add enriched columns if table already existed without them
ALTER TABLE ateliers
  ADD COLUMN IF NOT EXISTS subtitle TEXT,
  ADD COLUMN IF NOT EXISTS palier_label TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'emploi',
  ADD COLUMN IF NOT EXISTS step_tag TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS video_url TEXT DEFAULT 'https://youtu.be/6A1xfGvUFgk',
  ADD COLUMN IF NOT EXISTS objectifs TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tips TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS resource_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS speaker_name TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS speaker_role TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT 'notifications',
  ADD COLUMN IF NOT EXISTS accent_color TEXT DEFAULT '#D4A574',
  ADD COLUMN IF NOT EXISTS "order" INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS views_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 3. Row Level Security
ALTER TABLE ateliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access on active ateliers"
  ON ateliers FOR SELECT
  USING (true);

CREATE POLICY "Allow authenticated/service write on ateliers"
  ON ateliers FOR ALL
  USING (true)
  WITH CHECK (true);

-- 4. Seed / Upsert all 12 workshops with enriched data
INSERT INTO ateliers (
  id, titre, subtitle, palier, palier_label, category, step_tag,
  duree, description, video_url, objectifs, tips, resource_url,
  speaker_name, speaker_role, icon, accent_color, "order", is_active
) VALUES
(
  'alertes_emploi',
  'Alertes emploi',
  'Les créer et paramétrer',
  'palier_1',
  'Palier 1 - Se connaitre',
  'emploi',
  'Candidatures & Veille',
  '12:30',
  'Apprends à paramétrer des alertes précises sur France Travail, LinkedIn et Indeed pour ne manquer aucune opportunité sans y passer des heures chaque jour.',
  'https://youtu.be/6A1xfGvUFgk',
  ARRAY[
    'Identifier les mots-clés stratégiques pour son profil',
    'Configurer des alertes quotidiennes sans saturation',
    'Créer une routine efficace de veille et candidature'
  ],
  ARRAY[
    'Utilise des mots-clés larges et des filtres géographiques réalistes.',
    'Choisis une fréquence quotidienne pour postuler parmi les premières.',
    'Crée une adresse email dédiée pour regrouper tes candidatures.'
  ],
  'https://www.francetravail.fr',
  'Équipe Recrutement NAYHA',
  'Experte en sourcing emploi',
  'notifications',
  '#D4A574',
  1,
  true
),
(
  'agence_interim',
  'Agence d''intérim',
  'S''inscrire et se faire repérer',
  'palier_1',
  'Palier 1 - Se connaitre',
  'emploi',
  'Opportunités & Tremplin',
  '15:45',
  'L''intérim représente une formidable porte d''entrée. Découvre comment déposer ton CV en agence, te faire repérer et transformer une mission en CDI.',
  'https://youtu.be/8R5pnhK0f6o',
  ARRAY[
    'Sélectionner les agences spécialisées de son bassin d’emploi',
    'Préparer son pitch de 2 minutes en agence',
    'Négocier des missions avec perspective de titularisation'
  ],
  ARRAY[
    'Cible les agences spécialisées dans ton secteur.',
    'Passe directement en agence avec un CV imprimé.',
    'Indique clairement tes disponibilités et ta mobilité.'
  ],
  '',
  'Coach Emploi NAYHA',
  'Conseillère Insertion & Intérim',
  'business',
  '#8BA89E',
  2,
  true
),
(
  'candidature_spontanee',
  'Candidature spontanée',
  'Accéder au marché caché',
  'palier_2',
  'Palier 2 - Se positionner',
  'emploi',
  'Marché Caché & Réseau',
  '14:10',
  'Près de 50% des embauches se font sans annonce publique. Découvre comment identifier les recruteurs et leur adresser un message qui fait mouche.',
  'https://youtu.be/rUcNEnF_7ZE',
  ARRAY[
    'Trouver le bon décisionnaire sur LinkedIn ou annuaires pro',
    'Rédiger une accroche personnalisée qui démontre de la valeur',
    'Mettre en place une relance constructive sans harceler'
  ],
  ARRAY[
    'Adresse-toi directement au responsable d''équipe plutôt qu''à une boîte générique.',
    'Montre que tu connais leurs enjeux et propose une valeur concrète.',
    'Relance poliment à J+7 après ton premier message.'
  ],
  '',
  'Experte Réseau NAYHA',
  'Chasseuse de têtes & Coach',
  'mail',
  '#C4857A',
  3,
  true
),
(
  'organiser_recherche',
  'Organiser sa recherche',
  'Tenir le rythme sans s''épuiser',
  'palier_3',
  'Palier 3 - Avancer',
  'emploi',
  'Méthode & Organisation',
  '11:55',
  'La recherche d''emploi est un marathon. Découvre comment structurer tes journées, alterner candidatures et réseau, et garder une motivation intacte.',
  'https://youtu.be/IlzoLag7CEA',
  ARRAY[
    'Bâtir un semainier équilibré et protecteur d’énergie',
    'Créer un tableau de bord de suivi des candidatures',
    'Maintenir le moral et célébrer chaque micro-victoire'
  ],
  ARRAY[
    'Bloque 1 à 2 heures par jour max pour candidater.',
    'Varie les actions : 1 relance, 1 contact, 1 candidature.',
    'Fête chaque étape franchie (entretien, réponse positive).'
  ],
  '',
  'Coach NAYHA',
  'Spécialiste Organisation & Mental',
  'calendar',
  '#7B9BC4',
  4,
  true
),
(
  'clarifier_projet',
  'Clarifier son projet professionnel',
  'Trouver sa voie & faire le bilan',
  'palier_1',
  'Palier 1 - Se connaitre',
  'reconversion',
  'Bilan & Orientation',
  '18:20',
  'Définis un cap clair et réaliste pour ta reconversion. Identifie tes moteurs, tes aspirations et pose les bases d''un bilan solide pour choisir la bonne direction.',
  'https://youtu.be/APSJLWXbsJk',
  ARRAY[
    'Lister ses compétences, valeurs et contraintes personnelles',
    'Explorer des pistes métiers alignées avec son profil',
    'Valider la faisabilité avec des professionnels en poste'
  ],
  ARRAY[
    'Fais le point sur tes motivations profondes et tes contraintes.',
    'Explore les secteurs porteurs en lien avec tes centres d''intérêt.',
    'Valide la viabilité de ton idée avant de t''engager.'
  ],
  '',
  'Conseillère Bilan NAYHA',
  'Psychologue du travail & Coach carrière',
  'explore',
  '#D4A574',
  5,
  true
),
(
  'competences_transferables',
  'Identifier ses compétences transférables',
  'Changer de voie sans repartir de zéro',
  'palier_1',
  'Palier 1 - Se connaitre',
  'reconversion',
  'Compétences & Soft Skills',
  '16:40',
  'Méthode concrète pour cartographier tes savoir-faire et savoir-être acquis, et les traduire en atouts majeurs pour ton futur métier.',
  'https://youtu.be/VPjLkfufXDQ',
  ARRAY[
    'Identifier ses compétences techniques et comportementales',
    'Reformuler son vocabulaire métier pour une nouvelle cible',
    'Illustrer chaque compétence par un résultat quantifiable'
  ],
  ARRAY[
    'Découpe tes expériences passées en compétences précises.',
    'Traduis ton vocabulaire métier en compétences transversales.',
    'Mets en valeur tes soft skills (organisation, communication, adaptabilité).'
  ],
  '',
  'Experte Compétences NAYHA',
  'Formatrice en Transition Pro',
  'psychology',
  '#C4857A',
  6,
  true
),
(
  'financer_formation',
  'Choisir et financer sa formation',
  'CPF, France Travail & dispositifs d''aide',
  'palier_2',
  'Palier 2 - Se positionner',
  'reconversion',
  'Financement & Dossiers',
  '13:25',
  'Toutes les clés pour sélectionner un organisme de formation certifié (RNCP, Qualiopi) et mobiliser les bons financements (CPF, Transitions Pro, aides régionales).',
  'https://youtu.be/tXaIOFuG-rA',
  ARRAY[
    'Vérifier l’éligibilité de sa formation (Qualiopi, RNCP/RS)',
    'Combiner les aides (CPF, AIF, Région, Transitions Pro)',
    'Déposer un dossier solide dans les délais impartis'
  ],
  ARRAY[
    'Vérifie la reconnaissance RNCP et les certifications Qualiopi.',
    'Cumule ton solde CPF avec les abondements France Travail ou région.',
    'Anticipe les délais de constitution de dossier (1 à 3 mois).'
  ],
  'https://www.moncompteformation.gouv.fr',
  'Expert Dispositifs NAYHA',
  'Spécialiste Financements de Formation',
  'school',
  '#8BA89E',
  7,
  true
),
(
  'passer_emploi',
  'Passer à l’emploi dans son nouveau métier',
  'CV, entretien & posture de reconvertie',
  'palier_3',
  'Palier 3 - Avancer',
  'reconversion',
  'Immersion & Entretien',
  '10:50',
  'Valorise ta nouvelle légitimité professionnelle face aux recruteurs. Adopte le bon récit pour présenter ta reconversion comme une force unique.',
  'https://youtu.be/4pEo8xkBxGo',
  ARRAY[
    'Construire un CV par compétences ciblé reconversion',
    'Assumer et raconter sa bifurcation professionnelle en entretien',
    'Réaliser une PMSMP / immersion pour sécuriser l’embauche'
  ],
  ARRAY[
    'Adapte ton CV pour mettre en avant ta formation et ton projet.',
    'Pitch ton parcours de reconversion avec clarté et conviction.',
    'Active ton réseau et sollicite des entretiens de découverte.'
  ],
  '',
  'Coach Emploi NAYHA',
  'Coach en Reconversion Professionnelle',
  'rocket',
  '#7B9BC4',
  8,
  true
),
(
  'confiance_blocages',
  'Comprendre et lever ses blocages',
  'Syndrome de l''imposteur & légitimité',
  'palier_1',
  'Coaching confiance',
  'confiance',
  'Mental & Légitimité',
  '12:30',
  'Pourquoi on se sous-estime et comment sortir du piège de la légitimité. Les mécanismes invisibles qui freinent la reprise et l''affirmation de soi.',
  'https://youtu.be/8R5pnhK0f6o',
  ARRAY[
    'Identifier les mécanismes du syndrome de l’imposteur',
    'Désamorcer le dialogue intérieur d’autocritique',
    'Reconnaître ses compétences objectives et sa valeur'
  ],
  ARRAY[
    'Identifie tes croyances limitantes et nomme-les sans jugement.',
    'Distingue le blocage réel de l''histoire que tu te racontes.',
    'Rappelle-toi tes réussites passées avec objectivité.'
  ],
  '',
  'Coach Confiance NAYHA',
  'Praticienne en Développement Personnel',
  'psychology',
  '#C4857A',
  9,
  true
),
(
  'confiance_valeur',
  'Valoriser son parcours et ses forces',
  'Présenter son histoire avec fierté',
  'palier_1',
  'Coaching confiance',
  'confiance',
  'Pitch & Récit',
  '15:45',
  'Comment présenter son parcours et ses transitions sans minimiser ni se justifier. Les phrases clés pour mettre en avant ta valeur unique.',
  'https://youtu.be/APSJLWXbsJk',
  ARRAY[
    'Trouver le fil conducteur positif de son parcours',
    'Exprimer ses transitions sans attitude d’excuse',
    'Livrer un pitch fluide en 90 secondes'
  ],
  ARRAY[
    'Formule tes pauses et transitions comme des choix constructifs.',
    'Structure ton pitch en 90 secondes claires et percutantes.',
    'Appuie tes compétences sur des exemples vécus et concrets.'
  ],
  '',
  'Coach Expression NAYHA',
  'Spécialiste en Communication & Storytelling',
  'explore',
  '#D4A574',
  10,
  true
),
(
  'confiance_posture',
  'Adopter une posture assurée',
  'Corps, regard & première impression',
  'palier_2',
  'Coaching confiance',
  'confiance',
  'Posture & Non-verbal',
  '14:10',
  'Ce que communique ta posture avant même de parler. Les clés pour maîtriser son stress, habiter l''espace et créer une première impression mémorable.',
  'https://youtu.be/VPjLkfufXDQ',
  ARRAY[
    'Utiliser la respiration pour apaiser le trac en 2 minutes',
    'Adopter une posture ancrée et ouverte en entretien',
    'Maîtriser le contact visuel et le débit vocal'
  ],
  ARRAY[
    'Adopte une posture ouverte et respire calmement avant un échange.',
    'Maintiens un contact visuel franc et bienveillant.',
    'Prends le temps de poser ta voix et d''accueillir les silences.'
  ],
  '',
  'Coach Posture NAYHA',
  'Experte en Communication Non-Verbale',
  'school',
  '#8BA89E',
  11,
  true
),
(
  'confiance_negociation',
  'Négocier et oser demander',
  'Rémunération & conditions de travail',
  'palier_3',
  'Coaching confiance',
  'confiance',
  'Négociation & Rémunération',
  '11:55',
  'Stratégies concrètes pour aborder la rémunération et exprimer ses besoins sans peur du refus. Posture, chiffres et timing.',
  'https://youtu.be/tXaIOFuG-rA',
  ARRAY[
    'Estimer sa fourchette salariale selon les grilles du marché',
    'Argumenter sa demande avec des preuves tangibles',
    'Négocier le package global (télétravail, horaires, primes)'
  ],
  ARRAY[
    'Estime ta valeur sur le marché avant d''entrer en négociation.',
    'Pose ta fourchette avec clarté et sans hésitation.',
    'Pense à l''ensemble du package (télétravail, horaires, formation).'
  ],
  '',
  'Coach Carrière NAYHA',
  'Négociatrice & Conseil Dirigeants',
  'rocket',
  '#7B9BC4',
  12,
  true
)
ON CONFLICT (id) DO UPDATE SET
  titre = EXCLUDED.titre,
  subtitle = EXCLUDED.subtitle,
  palier = EXCLUDED.palier,
  palier_label = EXCLUDED.palier_label,
  category = EXCLUDED.category,
  step_tag = EXCLUDED.step_tag,
  duree = EXCLUDED.duree,
  description = EXCLUDED.description,
  video_url = EXCLUDED.video_url,
  objectifs = EXCLUDED.objectifs,
  tips = EXCLUDED.tips,
  resource_url = EXCLUDED.resource_url,
  speaker_name = EXCLUDED.speaker_name,
  speaker_role = EXCLUDED.speaker_role,
  icon = EXCLUDED.icon,
  accent_color = EXCLUDED.accent_color,
  "order" = EXCLUDED."order",
  is_active = EXCLUDED.is_active,
  updated_at = NOW();
