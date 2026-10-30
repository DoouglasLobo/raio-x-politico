-- Add nullable source identifiers without assigning or changing existing records.
alter table public.sources
  add column if not exists external_key text;

alter table public.parties
  add column if not exists camara_id bigint;

alter table public.politicians
  add column if not exists camara_id bigint;

alter table public.institutions
  add column if not exists external_key text;

alter table public.mandates
  add column if not exists camara_deputy_id bigint,
  add column if not exists camara_legislature_id bigint;

-- New columns are null on existing rows. Fail explicitly if a prior/manual
-- rollout already populated duplicate identifiers instead of changing data.
do $$
begin
  if exists (
    select 1 from public.sources
    where external_key is not null
    group by external_key
    having count(*) > 1
  ) then
    raise exception 'Duplicate non-null sources.external_key values; resolve them before continuing';
  end if;

  if exists (
    select 1 from public.parties
    where camara_id is not null
    group by camara_id
    having count(*) > 1
  ) then
    raise exception 'Duplicate non-null parties.camara_id values; resolve them before continuing';
  end if;

  if exists (
    select 1 from public.politicians
    where camara_id is not null
    group by camara_id
    having count(*) > 1
  ) then
    raise exception 'Duplicate non-null politicians.camara_id values; resolve them before continuing';
  end if;

  if exists (
    select 1 from public.institutions
    where external_key is not null
    group by external_key
    having count(*) > 1
  ) then
    raise exception 'Duplicate non-null institutions.external_key values; resolve them before continuing';
  end if;

  if exists (
    select 1 from public.mandates
    where camara_deputy_id is not null
      and camara_legislature_id is not null
    group by camara_deputy_id, camara_legislature_id
    having count(*) > 1
  ) then
    raise exception 'Duplicate Câmara deputy/legislature mandate keys; resolve them before continuing';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sources_external_key_nonempty'
      and conrelid = 'public.sources'::regclass
  ) then
    alter table public.sources
      add constraint sources_external_key_nonempty
      check (external_key is null or btrim(external_key) <> '');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'parties_camara_id_positive'
      and conrelid = 'public.parties'::regclass
  ) then
    alter table public.parties
      add constraint parties_camara_id_positive
      check (camara_id is null or camara_id > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'politicians_camara_id_positive'
      and conrelid = 'public.politicians'::regclass
  ) then
    alter table public.politicians
      add constraint politicians_camara_id_positive
      check (camara_id is null or camara_id > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'institutions_external_key_nonempty'
      and conrelid = 'public.institutions'::regclass
  ) then
    alter table public.institutions
      add constraint institutions_external_key_nonempty
      check (external_key is null or btrim(external_key) <> '');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'mandates_camara_ids_valid'
      and conrelid = 'public.mandates'::regclass
  ) then
    alter table public.mandates
      add constraint mandates_camara_ids_valid
      check (
        (camara_deputy_id is null and camara_legislature_id is null)
        or (
          camara_deputy_id is not null
          and camara_legislature_id is not null
          and camara_deputy_id > 0
          and camara_legislature_id > 0
        )
      );
  end if;
end
$$;

create unique index if not exists sources_external_key_unique_idx
  on public.sources (external_key)
  where external_key is not null;

create unique index if not exists parties_camara_id_unique_idx
  on public.parties (camara_id)
  where camara_id is not null;

create unique index if not exists politicians_camara_id_unique_idx
  on public.politicians (camara_id)
  where camara_id is not null;

create unique index if not exists institutions_external_key_unique_idx
  on public.institutions (external_key)
  where external_key is not null;

create unique index if not exists mandates_camara_person_legislature_unique_idx
  on public.mandates (camara_deputy_id, camara_legislature_id)
  where camara_deputy_id is not null
    and camara_legislature_id is not null;
