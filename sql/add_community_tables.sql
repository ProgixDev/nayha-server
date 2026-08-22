CREATE TABLE IF NOT EXISTS community_posts (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  auteur      TEXT        NOT NULL,
  initiale    TEXT        NOT NULL,
  contenu     TEXT        NOT NULL CHECK (char_length(contenu) <= 600),
  type        TEXT        NOT NULL DEFAULT 'normal'
                          CHECK (type IN ('normal','victoire','question','temoignage')),
  reactions_count INTEGER NOT NULL DEFAULT 0,
  is_moderated    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS community_reactions (
  post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS community_reports (
  id      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason  TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (post_id, user_id)
);
