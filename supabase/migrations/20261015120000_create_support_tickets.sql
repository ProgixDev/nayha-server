-- In-app support: each request (ticket) is a conversation between the user
-- and the NAYHA team. Only the API (service role) reads or writes these
-- tables, so RLS is enabled without any policy.

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic text NOT NULL
    CHECK (topic IN ('abonnement', 'documents', 'parcours', 'bug', 'autre')),
  subject text NOT NULL,
  -- waiting: the team has to answer; answered: the user has a reply;
  -- resolved: closed by the team or the user, reopened by a new message.
  status text NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'answered', 'resolved')),
  user_unread boolean NOT NULL DEFAULT false,
  admin_unread boolean NOT NULL DEFAULT true,
  last_message_preview text NOT NULL DEFAULT '',
  -- App version, platform… attached automatically to help the team.
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS support_tickets_user_idx
  ON public.support_tickets (user_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx
  ON public.support_tickets (status, last_message_at DESC);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  -- Owner of the ticket, kept here for the data export and deletion.
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- event: status change shown in the conversation (body holds its code).
  author text NOT NULL CHECK (author IN ('user', 'team', 'event')),
  author_name text,
  body text NOT NULL DEFAULT '',
  attachment_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_messages_ticket_idx
  ON public.support_messages (ticket_id, created_at);

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- Screenshots joined to requests: private, served through signed URLs.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'support-attachments',
  'support-attachments',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/heic', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;
