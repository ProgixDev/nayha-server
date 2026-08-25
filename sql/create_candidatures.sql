-- Candidatures tracking
create table if not exists candidatures (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  entreprise text not null,
  poste text not null,
  offre_text text, -- the pasted job offer, for context
  statut text not null default 'envoyee' check (statut in ('envoyee','en_attente','entretien','refusee','acceptee')),
  date_envoi timestamptz not null default now(),
  date_entretien timestamptz,
  ressenti_entretien text check (ressenti_entretien in ('bien','mitige','difficile')),
  issue_entretien text check (issue_entretien in ('sans_suite','en_attente','proposition')),
  delai_reponse_annonce int, -- days announced in job ad, if any
  relance_proposee boolean default false,
  relance_envoyee boolean default false,
  notes text,
  proposition_details jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Relance messages (AI-generated follow-up drafts)
create table if not exists relance_messages (
  id uuid default gen_random_uuid() primary key,
  candidature_id uuid references candidatures(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  type text not null check (type in ('email','linkedin')),
  message text not null,
  sent boolean default false,
  created_at timestamptz default now()
);

-- Bilans mensuels (monthly strategy analysis)
create table if not exists bilans_mensuels (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  mois text not null, -- '2026-08'
  total_envoyees int default 0,
  total_entretiens int default 0,
  total_reponses int default 0,
  taux_reponse numeric(5,2) default 0,
  "analyse" text not null, -- AI-generated analysis
  "strategie" text not null, -- AI-generated strategy for next month
  created_at timestamptz default now()
);

-- RLS policies
alter table candidatures enable row level security;
alter table relance_messages enable row level security;
alter table bilans_mensuels enable row level security;

drop policy if exists "Users can manage own candidatures" on candidatures;
create policy "Users can manage own candidatures" on candidatures
  for all using (auth.uid() = user_id);

drop policy if exists "Users can manage own relance messages" on relance_messages;
create policy "Users can manage own relance messages" on relance_messages
  for all using (auth.uid() = user_id);

drop policy if exists "Users can manage own bilans" on bilans_mensuels;
create policy "Users can manage own bilans" on bilans_mensuels
  for all using (auth.uid() = user_id);

-- Index for trigger queries
create index if not exists idx_candidatures_user_statut on candidatures(user_id, statut);
create index if not exists idx_candidatures_user_date on candidatures(user_id, date_envoi);
