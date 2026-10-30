create table public.sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  organization text,
  url text not null check (url ~* '^https?://'),
  description text,
  created_at timestamptz not null default now()
);

create table public.parties (
  id uuid primary key default gen_random_uuid(),
  acronym text not null unique,
  name text not null,
  source_id uuid references public.sources(id) on delete set null,
  origin text not null check (btrim(origin) <> ''),
  source_url text not null check (source_url ~* '^https?://'),
  last_updated_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  branch text,
  description text,
  source_id uuid references public.sources(id) on delete set null,
  origin text not null check (btrim(origin) <> ''),
  source_url text not null check (source_url ~* '^https?://'),
  last_updated_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.politicians (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  slug text not null unique,
  state text check (state is null or state ~ '^[A-Z]{2}$'),
  party_id uuid references public.parties(id) on delete set null,
  source_id uuid references public.sources(id) on delete set null,
  origin text not null check (btrim(origin) <> ''),
  source_url text not null check (source_url ~* '^https?://'),
  last_updated_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.mandates (
  id uuid primary key default gen_random_uuid(),
  politician_id uuid not null references public.politicians(id) on delete cascade,
  institution_id uuid references public.institutions(id) on delete set null,
  party_id uuid references public.parties(id) on delete set null,
  title text not null,
  district text,
  start_date date,
  end_date date,
  status text not null check (status in ('current', 'ended', 'unknown')),
  source_id uuid references public.sources(id) on delete set null,
  origin text not null check (btrim(origin) <> ''),
  source_url text not null check (source_url ~* '^https?://'),
  last_updated_at timestamptz,
  created_at timestamptz not null default now(),
  check (start_date is null or end_date is null or end_date >= start_date)
);

create table public.update_records (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('politician', 'party', 'institution', 'mandate')),
  politician_id uuid references public.politicians(id),
  party_id uuid references public.parties(id),
  institution_id uuid references public.institutions(id),
  mandate_id uuid references public.mandates(id),
  source_id uuid references public.sources(id) on delete set null,
  origin text not null check (btrim(origin) <> ''),
  source_url text not null check (source_url ~* '^https?://'),
  summary text,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (
    (entity_type = 'politician' and politician_id is not null and party_id is null and institution_id is null and mandate_id is null)
    or (entity_type = 'party' and party_id is not null and politician_id is null and institution_id is null and mandate_id is null)
    or (entity_type = 'institution' and institution_id is not null and politician_id is null and party_id is null and mandate_id is null)
    or (entity_type = 'mandate' and mandate_id is not null and politician_id is null and party_id is null and institution_id is null)
  )
);

create index politicians_full_name_idx on public.politicians (full_name);
create index politicians_state_idx on public.politicians (state);
create index politicians_party_id_idx on public.politicians (party_id);
create index parties_source_id_idx on public.parties (source_id);
create index institutions_source_id_idx on public.institutions (source_id);
create index politicians_source_id_idx on public.politicians (source_id);
create index mandates_politician_id_idx on public.mandates (politician_id);
create index mandates_institution_id_idx on public.mandates (institution_id);
create index mandates_party_id_idx on public.mandates (party_id);
create index mandates_source_id_idx on public.mandates (source_id);
create index mandates_dates_idx on public.mandates (start_date, end_date);
create index update_records_politician_idx on public.update_records (politician_id) where politician_id is not null;
create index update_records_party_idx on public.update_records (party_id) where party_id is not null;
create index update_records_institution_idx on public.update_records (institution_id) where institution_id is not null;
create index update_records_mandate_idx on public.update_records (mandate_id) where mandate_id is not null;
create index update_records_source_id_idx on public.update_records (source_id);
create index update_records_recorded_at_idx on public.update_records (recorded_at desc);

alter table public.sources enable row level security;
alter table public.parties enable row level security;
alter table public.institutions enable row level security;
alter table public.politicians enable row level security;
alter table public.mandates enable row level security;
alter table public.update_records enable row level security;

revoke all on table
  public.sources,
  public.parties,
  public.institutions,
  public.politicians,
  public.mandates,
  public.update_records
from anon, authenticated;

grant select on table
  public.sources,
  public.parties,
  public.institutions,
  public.politicians,
  public.mandates,
  public.update_records
to anon, authenticated;

create policy "Public can read sources"
  on public.sources for select to anon, authenticated using (true);
create policy "Public can read parties"
  on public.parties for select to anon, authenticated using (true);
create policy "Public can read institutions"
  on public.institutions for select to anon, authenticated using (true);
create policy "Public can read politicians"
  on public.politicians for select to anon, authenticated using (true);
create policy "Public can read mandates"
  on public.mandates for select to anon, authenticated using (true);
create policy "Public can read update records"
  on public.update_records for select to anon, authenticated using (true);
