-- ============================================================================
-- PawMatch — Row Level Security policies (run AFTER schema.sql)
--
-- The demo app connects with the Supabase ANON key and has no Supabase Auth
-- login wired yet, so identity CANNOT be proven server-side. These policies
-- are therefore "demo-open": public read everywhere, public write on
-- user-generated tables. That is fine for a classroom demo behind a project
-- only Maruf shares, but NOT for production.
--
-- Production hardening (Supabase Auth wired): replace the anon write
-- policies with the stricter variants kept in the comments below.
-- ============================================================================

-- Enable RLS on every table -----------------------------------------------
alter table public.users                 enable row level security;
alter table public.pets                  enable row level security;
alter table public.adoption_applications enable row level security;
alter table public.conversations         enable row level security;
alter table public.chat_messages         enable row level security;
alter table public.lost_found_reports    enable row level security;
alter table public.medical_records       enable row level security;
alter table public.vaccinations          enable row level security;
alter table public.vet_appointments      enable row level security;
alter table public.services              enable row level security;
alter table public.service_bookings      enable row level security;
alter table public.notifications         enable row level security;
alter table public.favorites             enable row level security;
alter table public.activity_logs         enable row level security;

-- Helper: drop-if-exists so the script is re-runnable ----------------------
do $$
declare r record;
begin
  for r in (
    select policyname, tablename from pg_policies where schemaname = 'public'
  ) loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- PUBLIC READ: anyone (even logged-out visitors) can browse the demo ------
create policy "public read pets"
  on public.pets for select using (true);
create policy "public read services"
  on public.services for select using (true);
create policy "public read lost_found"
  on public.lost_found_reports for select using (true);
create policy "public read users (directory)"
  on public.users for select using (true);
-- PROD: restrict to verified/active users: using (is_active = true)

-- PETS: owners/shelters/admins manage their own listings --------------------
create policy "anon insert pets"
  on public.pets for insert with check (true);
-- PROD: with check (auth.uid()::text = owner_id)
create policy "anon update pets"
  on public.pets for update using (true);
-- PROD: using (auth.uid()::text = owner_id)
create policy "anon delete pets"
  on public.pets for delete using (true);
-- PROD: using (auth.uid()::text = owner_id)

-- ADOPTION APPLICATIONS: anyone can apply; applicant+admin manage ----------
create policy "public read applications"
  on public.adoption_applications for select using (true);
create policy "anon insert applications"
  on public.adoption_applications for insert with check (true);
-- PROD: with check (auth.uid()::text = applicant_id)
create policy "anon update applications (review)"
  on public.adoption_applications for update using (true);
-- PROD: using (auth.uid()::text = applicant_id
--        or exists (select 1 from public.users where id = auth.uid()::text and role = 'admin'))

-- CONVERSATIONS + MESSAGES: the live-chat backbone --------------------------
create policy "public read conversations"
  on public.conversations for select using (true);
-- PROD: using (auth.uid()::text = any (participant_ids))
create policy "anon insert conversations"
  on public.conversations for insert with check (true);
create policy "anon update conversations"
  on public.conversations for update using (true);

create policy "public read messages"
  on public.chat_messages for select using (true);
-- PROD: using (exists (
--   select 1 from public.conversations c
--   where c.id = chat_messages.conversation_id
--     and auth.uid()::text = any (c.participant_ids)))
create policy "anon insert messages"
  on public.chat_messages for insert with check (true);
-- PROD: with check (auth.uid()::text = sender_id and exists (
--   select 1 from public.conversations c
--   where c.id = chat_messages.conversation_id
--     and auth.uid()::text = any (c.participant_ids)))
create policy "anon update messages (read receipts)"
  on public.chat_messages for update using (true);
-- PROD: using (auth.uid()::text = receiver_id)

-- LOST & FOUND: community board ---------------------------------------------
create policy "anon insert lost_found"
  on public.lost_found_reports for insert with check (true);
create policy "anon update lost_found (resolve)"
  on public.lost_found_reports for update using (true);

-- HEALTHCARE ------------------------------------------------------------------
create policy "public read medical_records"
  on public.medical_records for select using (true);
create policy "anon insert medical_records"
  on public.medical_records for insert with check (true);

create policy "public read vaccinations"
  on public.vaccinations for select using (true);
create policy "anon insert vaccinations"
  on public.vaccinations for insert with check (true);

create policy "public read vet_appointments"
  on public.vet_appointments for select using (true);
create policy "anon insert vet_appointments"
  on public.vet_appointments for insert with check (true);
create policy "anon update vet_appointments"
  on public.vet_appointments for update using (true);

-- SERVICES + BOOKINGS ------------------------------------------------------------
create policy "anon insert service_bookings"
  on public.service_bookings for insert with check (true);
-- PROD: with check (auth.uid()::text = user_id)
create policy "public read service_bookings"
  on public.service_bookings for select using (true);
-- PROD: using (auth.uid()::text = user_id
--        or exists (select 1 from public.users where id = auth.uid()::text and role = 'admin'))
create policy "anon update service_bookings"
  on public.service_bookings for update using (true);

-- NOTIFICATIONS: per-user inbox -----------------------------------------------
create policy "public read notifications"
  on public.notifications for select using (true);
-- PROD: using (auth.uid()::text = user_id)
create policy "anon insert notifications"
  on public.notifications for insert with check (true);
create policy "anon update notifications (mark read)"
  on public.notifications for update using (true);
-- PROD: using (auth.uid()::text = user_id)

-- FAVORITES -----------------------------------------------------------------------
create policy "public read favorites"
  on public.favorites for select using (true);
create policy "anon manage favorites"
  on public.favorites for all using (true) with check (true);
-- PROD: for select using (auth.uid()::text = user_id);
--       for insert with check (auth.uid()::text = user_id);
--       for delete using (auth.uid()::text = user_id);

-- ACTIVITY LOGS (admin audit) -------------------------------------------------------
create policy "public read activity_logs"
  on public.activity_logs for select using (true);
create policy "anon insert activity_logs"
  on public.activity_logs for insert with check (true);

-- USERS: profile updates ------------------------------------------------------------
create policy "anon insert users (registration)"
  on public.users for insert with check (true);
create policy "anon update users (lockout/profile)"
  on public.users for update using (true);
-- PROD: using (auth.uid()::text = id
--        or exists (select 1 from public.users where id = auth.uid()::text and role = 'admin'))
