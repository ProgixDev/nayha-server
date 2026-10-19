-- Nightly import of the training offers (see PLAN_FORMATIONS.md): at 03:00
-- UTC, after Mon Compte Formation publishes its daily extract, pg_cron asks
-- the API to start the import. The shared secret lives in Supabase Vault
-- (name: training_sync_secret) and must equal TRAINING_SYNC_SECRET on Render.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('training-offers-sync')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'training-offers-sync');

SELECT cron.schedule(
  'training-offers-sync',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://nayha-server-kpw2.onrender.com/training-offers/sync/cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'training_sync_secret'
      )
    ),
    body := '{}'::jsonb,
    -- The Render instance may be asleep: leave it time to wake up.
    timeout_milliseconds := 120000
  );
  $$
);
