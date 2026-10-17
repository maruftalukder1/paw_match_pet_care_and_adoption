-- ============================================================================
-- PawMatch — Supabase schema (Postgres)
-- Run this FIRST in the Supabase SQL editor (in this order):
--   1. schema.sql   (this file)
--   2. policies.sql (Row Level Security)
--   3. seed.sql     (demo data: same 15 pets / 11 users as the local app)
--
-- Table names/columns mirror src/types.ts of the React app.
-- ============================================================================

-- USERS -----------------------------------------------------------------------
create table if not exists public.users (
  id                text primary key,
  name              text not null,
  email             text not null unique,
  phone             text,
  password_hash     text not null default '',
  role              text not null check (role in ('adopter','owner','shelter','vet','service_provider','admin')),
  area              text,
  lat               double precision,
  lon               double precision,
  is_active         boolean not null default true,
  failed_login_attempts integer not null default 0,
  is_locked         boolean not null default false,
  security_question text,
  security_answer   text,
  -- role-specific extras (homeType, clinicName, capacity, ...) live here so
  -- the base table stays stable while profiles evolve
  profile_json      jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);
create index if not exists idx_users_role on public.users (role);
create index if not exists idx_users_email on public.users (email);

-- PETS ------------------------------------------------------------------------
create table if not exists public.pets (
  id            text primary key,
  name          text not null,
  species       text not null check (species in ('dog','cat','bird','rabbit','other')),
  breed         text,
  age_months    integer,
  gender        text check (gender in ('Male','Female')),
  size          text check (size in ('small','medium','large')),
  color         text,
  energy_level  text check (energy_level in ('low','moderate','high')),
  good_with_kids boolean not null default false,
  good_with_pets boolean not null default false,
  vaccinated    boolean not null default false,
  neutered      boolean not null default false,
  health_notes  text,
  status        text not null default 'Available'
                check (status in ('Available','Pending','Adopted','Lost','Found')),
  owner_id      text references public.users(id) on delete set null,
  owner_name    text,
  owner_role    text check (owner_role in ('owner','shelter')),
  area          text,
  lat           double precision,
  lon           double precision,
  photo_url     text,
  description   text,
  tags          text[] not null default '{}',
  date_added    date,
  created_at    timestamptz not null default now()
);
create index if not exists idx_pets_status  on public.pets (status);
create index if not exists idx_pets_species on public.pets (species);
create index if not exists idx_pets_owner   on public.pets (owner_id);

-- ADOPTION APPLICATIONS ---------------------------------------------------------
create table if not exists public.adoption_applications (
  id                  text primary key,
  pet_id              text references public.pets(id) on delete cascade,
  pet_name            text,
  pet_breed           text,
  pet_photo_url       text,
  applicant_id        text references public.users(id) on delete set null,
  applicant_name      text,
  applicant_email     text,
  applicant_phone     text,
  applicant_address   text,
  applicant_age       integer,
  applicant_occupation text,
  reason              text,
  previous_experience text,
  has_other_pets      boolean not null default false,
  has_enough_space    boolean not null default false,
  "references"        text,
  status              text not null default 'Submitted'
                      check (status in ('Submitted','Under Review','Approved','Rejected','Completed')),
  review_notes        text,
  submitted_at        timestamptz not null default now(),
  updated_at          timestamptz,
  created_at          timestamptz not null default now()
);
create index if not exists idx_apps_pet       on public.adoption_applications (pet_id);
create index if not exists idx_apps_applicant on public.adoption_applications (applicant_id);
create index if not exists idx_apps_status    on public.adoption_applications (status);

-- CONVERSATIONS -----------------------------------------------------------------
create table if not exists public.conversations (
  id               text primary key,
  participant_ids  text[] not null,
  participant_names text[] not null default '{}',
  pet_id           text references public.pets(id) on delete set null,
  last_message     text,
  last_message_at  timestamptz not null default now(),
  created_at       timestamptz not null default now()
);
create index if not exists idx_conversations_participants on public.conversations using gin (participant_ids);

-- CHAT MESSAGES -----------------------------------------------------------------
-- The hot table: one row per message. The (conversation_id, created_at)
-- composite index keeps per-conversation history fast, and the table is
-- added to the supabase_realtime publication for live messaging.
create table if not exists public.chat_messages (
  id              text primary key,
  conversation_id text not null references public.conversations(id) on delete cascade,
  sender_id       text references public.users(id) on delete set null,
  sender_name     text,
  receiver_id     text references public.users(id) on delete set null,
  content         text not null,
  is_read         boolean not null default false,
  attachment      jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
-- NOTE: existing live databases created before this column was added need:
--   alter table public.chat_messages add column if not exists attachment jsonb not null default '{}'::jsonb;
create index if not exists idx_messages_conv_time on public.chat_messages (conversation_id, created_at);
create index if not exists idx_messages_receiver on public.chat_messages (receiver_id, is_read);

-- Realtime for chat (idempotent: drop first so re-runs are safe)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;

-- Realtime for pets (idempotent)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'pets'
  ) then
    alter publication supabase_realtime add table public.pets;
  end if;
end $$;

-- Tags column on pets (idempotent) — seed data carries tags (search filters,
-- CSV exports), so the live table needs them to render identically.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pets' and column_name = 'tags'
  ) then
    alter table public.pets add column tags text[] not null default '{}';
  end if;
end $$;

-- LOST & FOUND ------------------------------------------------------------------
create table if not exists public.lost_found_reports (
  id                text primary key,
  type              text not null check (type in ('Lost','Found')),
  species           text,
  breed             text,
  pet_name          text,
  color             text,
  size              text,
  area              text,
  lat               double precision,
  lon               double precision,
  date              date,
  description       text,
  photo_url         text,
  contact_name      text,
  contact_phone     text,
  status            text not null default 'Active' check (status in ('Active','Resolved')),
  matched_report_id text,
  created_at        timestamptz not null default now()
);
create index if not exists idx_lostfound_status on public.lost_found_reports (status);
create index if not exists idx_lostfound_type   on public.lost_found_reports (type);

-- HEALTHCARE --------------------------------------------------------------------
create table if not exists public.medical_records (
  id         text primary key,
  pet_id     text references public.pets(id) on delete cascade,
  pet_name   text,
  date       date,
  diagnosis  text,
  treatment  text,
  vet_name   text,
  weight_kg  numeric,
  notes      text,
  created_at timestamptz not null default now()
);
create index if not exists idx_medrec_pet on public.medical_records (pet_id);

create table if not exists public.vaccinations (
  id                text primary key,
  pet_id            text references public.pets(id) on delete cascade,
  pet_name          text,
  vaccine_name      text,
  date_administered date,
  next_due_date     date,
  -- NOTE: status ('Upcoming'/'Overdue') is COMPUTED from next_due_date in
  -- the app (src/utils/time.ts) and intentionally not stored.
  created_at        timestamptz not null default now()
);
create index if not exists idx_vacc_pet on public.vaccinations (pet_id);

create table if not exists public.vet_appointments (
  id          text primary key,
  pet_id      text references public.pets(id) on delete cascade,
  pet_name    text,
  vet_id      text references public.users(id) on delete set null,
  vet_name    text,
  clinic_name text,
  date        date,
  time_slot   text,
  reason      text,
  status      text not null default 'Scheduled'
              check (status in ('Scheduled','Completed','Cancelled')),
  created_at  timestamptz not null default now()
);
create index if not exists idx_appt_vet_date on public.vet_appointments (vet_id, date);

-- SERVICES ----------------------------------------------------------------------
create table if not exists public.services (
  id           text primary key,
  provider_id  text references public.users(id) on delete set null,
  provider_name text,
  service_type text check (service_type in ('grooming','walking','sitting','training')),
  title        text,
  description  text,
  price        numeric,
  duration     text,
  rating       numeric,
  review_count integer,
  area         text,
  lat          double precision,
  lon          double precision,
  image_url    text,
  created_at   timestamptz not null default now()
);

create table if not exists public.service_bookings (
  id            text primary key,
  service_id    text references public.services(id) on delete cascade,
  service_title text,
  provider_name text,
  user_id       text references public.users(id) on delete set null,
  user_name     text,
  pet_name      text,
  booking_date  date,
  status        text not null default 'Pending'
                check (status in ('Pending','Confirmed','Completed','Cancelled')),
  price         numeric,
  created_at    timestamptz not null default now()
);
create index if not exists idx_bookings_user on public.service_bookings (user_id);

-- NOTIFICATIONS -------------------------------------------------------------------
create table if not exists public.notifications (
  id         text primary key,
  user_id    text not null references public.users(id) on delete cascade,
  title      text,
  message    text,
  type       text not null default 'message'
             check (type in ('message','application','match','health','lost_found','booking')),
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_notif_user on public.notifications (user_id, is_read);

-- FAVORITES -----------------------------------------------------------------------
create table if not exists public.favorites (
  user_id    text not null references public.users(id) on delete cascade,
  pet_id     text not null references public.pets(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, pet_id)
);

-- ACTIVITY LOGS -------------------------------------------------------------------
create table if not exists public.activity_logs (
  id         text primary key,
  actor      text,
  action     text,
  details    text,
  created_at timestamptz not null default now()
);
