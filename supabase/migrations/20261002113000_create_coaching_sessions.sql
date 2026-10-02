-- Coaching confiance: one guided session, its messages, and its weekly commitment.
CREATE TABLE IF NOT EXISTS public.coaching_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  trigger_context text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'ready_to_complete', 'completed', 'cancelled')),
  confidence_before numeric(3,1)
    CHECK (confidence_before IS NULL OR confidence_before BETWEEN 0 AND 10),
  confidence_after numeric(3,1)
    CHECK (confidence_after IS NULL OR confidence_after BETWEEN 0 AND 10),
  blocker text,
  insight text,
  report text,
  commitment text,
  commitment_due_at timestamptz,
  commitment_status text NOT NULL DEFAULT 'pending'
    CHECK (commitment_status IN ('pending', 'done', 'not_done')),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coaching_sessions_user_created_at_idx
  ON public.coaching_sessions (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.coaching_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.coaching_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  sequence integer NOT NULL CHECK (sequence > 0),
  sender text NOT NULL CHECK (sender IN ('coach', 'user')),
  text text NOT NULL CHECK (char_length(trim(text)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, sequence)
);

CREATE INDEX IF NOT EXISTS coaching_messages_session_sequence_idx
  ON public.coaching_messages (session_id, sequence);
