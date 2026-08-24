-- Additional fields for the v2 candidature tracking table.
alter table candidatures
  add column if not exists lien text,
  add column if not exists date_derniere_relance timestamptz,
  add column if not exists prochaine_relance timestamptz;

-- Keep the existing statuses and add the explicit relance state.
alter table candidatures drop constraint if exists candidatures_statut_check;
alter table candidatures add constraint candidatures_statut_check
  check (statut in ('envoyee','en_attente','a_relancer','entretien','refusee','acceptee'));

update candidatures
set prochaine_relance = date_envoi + interval '7 days'
where prochaine_relance is null;

create table if not exists candidature_actions (
  id uuid default gen_random_uuid() primary key,
  candidature_id uuid references candidatures(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  action text not null,
  ancien_statut text,
  nouveau_statut text,
  note text,
  created_at timestamptz default now()
);

alter table candidature_actions enable row level security;
drop policy if exists "Users can manage own candidature actions" on candidature_actions;
create policy "Users can manage own candidature actions" on candidature_actions
  for all using (auth.uid() = user_id);

create index if not exists idx_candidature_actions_user_date
  on candidature_actions(user_id, created_at desc);
create index if not exists idx_candidatures_next_relance
  on candidatures(user_id, prochaine_relance);
