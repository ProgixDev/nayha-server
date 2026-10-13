-- Invisible fair-use caps on AI features for subscribers. One row per user,
-- kind of usage and period (day or month); only the API (service role)
-- reads or writes it.
CREATE TABLE IF NOT EXISTS public.ai_usage (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  period_start date NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, kind, period_start)
);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

-- Atomically counts one use and returns false once the limit is reached,
-- so concurrent requests cannot go over it.
CREATE OR REPLACE FUNCTION public.consume_ai_usage(
  p_user_id uuid,
  p_kind text,
  p_period_start date,
  p_limit integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  used integer;
BEGIN
  INSERT INTO public.ai_usage AS usage (user_id, kind, period_start, count)
  VALUES (p_user_id, p_kind, p_period_start, 1)
  ON CONFLICT (user_id, kind, period_start)
  DO UPDATE SET count = usage.count + 1
  WHERE usage.count < p_limit
  RETURNING usage.count INTO used;
  RETURN used IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_ai_usage(uuid, text, date, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_usage(uuid, text, date, integer)
  TO service_role;
