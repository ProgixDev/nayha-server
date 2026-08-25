-- Details supplied when a user receives an employment proposition.
alter table candidatures
  add column if not exists proposition_details jsonb not null default '{}'::jsonb;
