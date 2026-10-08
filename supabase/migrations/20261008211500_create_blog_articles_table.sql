-- ============================================================================
-- Migration: Create blog_articles & blog_views tables with seed data and permissions
-- Timestamp: 2026-10-08 21:15:00
-- ============================================================================

CREATE TABLE IF NOT EXISTS blog_articles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Général',
  read_time_minutes INT NOT NULL DEFAULT 3,
  key_takeaway TEXT NOT NULL DEFAULT '',
  exercise_title TEXT,
  exercise_prompt TEXT,
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  coach_trigger TEXT NOT NULL DEFAULT 'Coaching',
  coach_message TEXT NOT NULL DEFAULT '',
  is_published BOOLEAN NOT NULL DEFAULT true,
  views_count INT NOT NULL DEFAULT 0,
  author_name TEXT DEFAULT 'Équipe NAYHA',
  author_role TEXT DEFAULT 'Experte NAYHA',
  author_avatar_url TEXT,
  cover_image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blog_articles_category ON blog_articles (category);
CREATE INDEX IF NOT EXISTS idx_blog_articles_published ON blog_articles (is_published);
CREATE INDEX IF NOT EXISTS idx_blog_articles_created_at ON blog_articles (created_at DESC);

CREATE TABLE IF NOT EXISTS blog_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id TEXT NOT NULL REFERENCES blog_articles(id) ON DELETE CASCADE,
  user_id UUID,
  session_id TEXT,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blog_views_article_id ON blog_views (article_id);
CREATE INDEX IF NOT EXISTS idx_blog_views_user_id ON blog_views (user_id);

-- Enable RLS
ALTER TABLE blog_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_views ENABLE ROW LEVEL SECURITY;

-- RLS Policies for blog_articles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'blog_articles' AND policyname = 'Allow public read published blog articles'
  ) THEN
    CREATE POLICY "Allow public read published blog articles"
      ON blog_articles FOR SELECT
      USING (is_published = true OR auth.role() = 'service_role' OR auth.role() = 'authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'blog_articles' AND policyname = 'Allow service_role full access to blog articles'
  ) THEN
    CREATE POLICY "Allow service_role full access to blog articles"
      ON blog_articles FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'blog_articles' AND policyname = 'Allow authenticated full access to blog articles'
  ) THEN
    CREATE POLICY "Allow authenticated full access to blog articles"
      ON blog_articles FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- RLS Policies for blog_views
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'blog_views' AND policyname = 'Allow public insert blog views'
  ) THEN
    CREATE POLICY "Allow public insert blog views"
      ON blog_views FOR INSERT
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'blog_views' AND policyname = 'Allow select blog views'
  ) THEN
    CREATE POLICY "Allow select blog views"
      ON blog_views FOR SELECT
      USING (true);
  END IF;
END $$;

-- Update Admin Role Permissions to include blog_view and blog_edit
UPDATE admin_role_permissions
SET permissions = jsonb_set(
  jsonb_set(permissions, '{blog_view}', 'true'::jsonb),
  '{blog_edit}',
  CASE WHEN role IN ('super_admin', 'admin') THEN 'true'::jsonb ELSE 'false'::jsonb END
)
WHERE role IN ('super_admin', 'admin', 'moderator', 'viewer');

-- Seed Initial 6 Blog Articles
INSERT INTO blog_articles (
  id,
  title,
  subtitle,
  category,
  read_time_minutes,
  key_takeaway,
  exercise_title,
  exercise_prompt,
  sections,
  coach_trigger,
  coach_message,
  is_published,
  views_count,
  author_name,
  author_role,
  created_at,
  updated_at
)
VALUES
(
  'premiers-pas-confiance',
  'Les premiers pas pour avancer avec confiance',
  'Comment dépasser la paralysie du doute et réenclencher une dynamique positive au quotidien.',
  'Confiance',
  3,
  'La confiance ne précède pas l’action, elle en est la conséquence directe. Commencer par un micro-geste réalisable débloque l’élan.',
  'Ton micro-geste du jour (2 min)',
  'Identifie une seule chose que tu repousses par manque d’assurance. Rends-la si petite qu’il est impossible d’échouer, et fais-la maintenant.',
  '[
    {"heading": "Le mythe du courage préalable", "content": "On attend souvent de \"se sentir prêt\" ou \"d’avoir confiance\" avant de postuler, de contacter une personne du réseau ou de poser les bases d’un projet. En réalité, le cerveau attend des preuves tangibles de succès avant de libérer le sentiment de sécurité intérieure."},
    {"heading": "La règle de la micro-marche", "content": "Plutôt que de viser un objectif monumental, découpe-le en une tâche de 5 minutes. Ouvrir un document et écrire 3 compétences suffit à relancer l’énergie."},
    {"heading": "Accepter l’inconfort passager", "content": "L’hésitation n’est pas un signe d’incompétence. C’est simplement le signe que tu t’aventures hors de ta zone de confort connue. Sois bienveillant avec ce ressenti et avance à ton rythme."}
  ]'::jsonb,
  'Reprendre confiance',
  'J’ai lu l’article sur les premiers pas pour avancer avec confiance. Comment puis-je définir mon tout premier micro-geste cette semaine ?',
  true,
  240,
  'Équipe NAYHA',
  'Experte Coaching & Confiance',
  NOW(),
  NOW()
),
(
  'transformer-experience-atout',
  'Transformer son expérience en véritable atout',
  'Mettre en valeur son parcours singulier, ses compétences transversales et ses apprentissages.',
  'Retour à l’emploi',
  4,
  'Chaque étape de ton parcours t’a appris des compétences précieuses. Ce n’est pas la linéarité qui fait la valeur, c’est le fil conducteur que tu racontes.',
  'L’exercice des compétences invisibles',
  'Liste 3 compétences relationnelles ou d’organisation que tu as développées en dehors d’un cadre professionnel classique.',
  '[
    {"heading": "Sortir de la comparaison", "content": "Il est tentant de comparer son CV à des parcours ultra-linéaires. Pourtant, les recruteurs recherchent de plus en plus des profils adaptables, résilients et capables d’apporter une perspective différente."},
    {"heading": "Identifier le fil conducteur", "content": "Quelle est la valeur ou le plaisir qui a toujours guidé tes choix ? L’écoute, la rigueur, le sens du service, la créativité ? C’est ce fil rouge qui donne toute sa cohérence à ton histoire."},
    {"heading": "Exprimer ses réussites avec simplicité", "content": "Parler de ses réussites ne signifie pas se vanter. Il s’agit simplement de décrire une situation, ton action concrète et le résultat obtenu pour l’équipe ou le projet."}
  ]'::jsonb,
  'Valoriser mon parcours',
  'J’aimerais apprendre à mieux raconter mon parcours et valoriser mes compétences transversales.',
  true,
  185,
  'Équipe NAYHA',
  'Experte Emploi & Carrières',
  NOW(),
  NOW()
),
(
  'trouver-rythme-durable',
  'Trouver un rythme durable pour son projet',
  'Éviter l’épuisement et bâtir une routine bienveillante et régulière vers ses objectifs.',
  'Confiance',
  3,
  'La constance douce bat toujours l’intensité brève. Mieux vaut 20 minutes chaque matin qu’une journée entière suivie de deux semaines de découragement.',
  'Ta plage de respiration',
  'Définis une heure fixe dans ta semaine où tu fermes les écrans et où tu t’accordes une pause totale sans culpabilité.',
  '[
    {"heading": "La fatigue invisible de la transition", "content": "Changer de métier ou chercher un emploi demande une énergie mentale colossale. La remise en question, les doutes et l’incertitude consomment énormément de ressources."},
    {"heading": "Protéger ses temps de récupération", "content": "Une pause n’est pas du temps perdu : c’est le carburant indispensable pour garder de la lucidité, de la créativité et de la motivation sur la durée."}
  ]'::jsonb,
  'Rythme et sérénité',
  'Comment organiser mes journées pour avancer sur mon projet professionnel sans me sentir débordé(e) ?',
  true,
  142,
  'Équipe NAYHA',
  'Coach Bien-être & Organisation',
  NOW(),
  NOW()
),
(
  'reconversion-identifier-voie',
  'Clarifier sa voie lors d’une reconversion',
  'Les 3 questions clés pour aligner ses envies profondes avec les réalités du marché.',
  'Reconversion',
  5,
  'Une reconversion réussie se situe au croisement de ce que tu aimes faire, de tes talents naturels et des opportunités réelles sur le terrain.',
  'Le filtre des 3 cercles',
  'Note 2 activités professionnelles qui te donnent de l’énergie, et 2 tâches que tu souhaites absolument bannir de ton futur quotidien.',
  '[
    {"heading": "Partir de ses sources d’énergie", "content": "Au lieu de chercher directement un intitulé de poste, commence par identifier les conditions dans lesquelles tu t’épanouis : travailler en équipe ou en autonomie, en intérieur ou sur le terrain."},
    {"heading": "Valider sur le terrain par l’immersion", "content": "Rien ne remplace le contact direct avec des professionnels en poste. Passer une journée en observation (PMSMP) ou faire des interviews métier dissipe les fantasmes."}
  ]'::jsonb,
  'Clarifier ma reconversion',
  'Je suis en pleine réflexion de reconversion et j’aimerais poser les critères essentiels de mon futur métier.',
  true,
  310,
  'Équipe NAYHA',
  'Conseillère Reconversion',
  NOW(),
  NOW()
),
(
  'premiers-clients-activite',
  'Décrocher ses premiers clients sans forcer',
  'La méthode bienveillante pour activer son réseau proche et tester son offre avec authenticité.',
  'Création d’activité',
  4,
  'Vendre un service, c’est avant tout résoudre un problème pour quelqu’un. Quand tu te concentres sur l’aide à apporter, la peur de vendre disparaît.',
  'Le message de découverte',
  'Pense à une personne de ton entourage qui pourrait bénéficier de tes compétences. Propose-lui un échange de 15 min pour lui demander son avis sincère.',
  '[
    {"heading": "Clarifier la transformation", "content": "Les clients n’achètent pas des heures : ils recherchent un soulagement, un gain de temps ou une sérénité retrouvée."},
    {"heading": "La puissance des retours d’expérience", "content": "Tes premiers accompagnements sont précieux pour collecter des témoignages concrets. Ils constituent la base de ta crédibilité future."}
  ]'::jsonb,
  'Lancer mon activité',
  'Je prépare le lancement de mon activité et j’aimerais définir ma proposition de valeur pour mes premiers clients.',
  true,
  95,
  'Équipe NAYHA',
  'Experte Entrepreneuriat',
  NOW(),
  NOW()
),
(
  'preparer-entretien-sereinement',
  'Aborder un entretien avec authenticité et clarté',
  'Comment transformer un échange d’embauche en une véritable conversation d’égal à égal.',
  'Retour à l’emploi',
  4,
  'Un entretien n’est pas un interrogatoire : c’est une rencontre pour voir si votre collaboration a du sens pour les deux parties.',
  'La question miroir',
  'Rédige 2 questions précises que tu souhaites poser au recruteur pour savoir si cet environnement te correspond vraiment.',
  '[
    {"heading": "Changer de posture", "content": "Le recruteur a un problème à résoudre et cherche un allié. En adoptant une posture d’écoute et de curiosité sincère, tu évites le stress du candidat jugé."},
    {"heading": "La structure STAR pour tes exemples", "content": "Pour chaque compétence revendiquée, prépare un exemple concret : Situation, Tâche, Action et Résultat."}
  ]'::jsonb,
  'Préparer un entretien',
  'J’ai un entretien à préparer et j’aimerais m’entraîner à répondre aux questions avec assurance et authenticité.',
  true,
  215,
  'Équipe NAYHA',
  'Recruteuse & Coach RH',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  subtitle = EXCLUDED.subtitle,
  category = EXCLUDED.category,
  read_time_minutes = EXCLUDED.read_time_minutes,
  key_takeaway = EXCLUDED.key_takeaway,
  exercise_title = EXCLUDED.exercise_title,
  exercise_prompt = EXCLUDED.exercise_prompt,
  sections = EXCLUDED.sections,
  coach_trigger = EXCLUDED.coach_trigger,
  coach_message = EXCLUDED.coach_message,
  author_name = EXCLUDED.author_name,
  author_role = EXCLUDED.author_role,
  updated_at = NOW();
