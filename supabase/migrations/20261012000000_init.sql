-- CoffeeChat AI — initial schema
--
-- Ownership model
--   * Every private table has a user_id column referencing auth.users.
--   * Row Level Security (RLS) is enabled on every table: a signed-in user can
--     only see and change rows where user_id = auth.uid().
--   * Child tables use COMPOSITE foreign keys (parent_id, user_id) so a row can
--     never point at a parent owned by a different user, even if someone
--     guesses another user's UUID.
--   * History is preserved: notes and summaries are append-only from the app,
--     and deleting a contact cascades only that contact's own records.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  preferred_name text not null default '',
  hometown text not null default '',
  school text not null default '',
  major text not null default '',
  background text not null default '',
  interests text[] not null default '{}',
  target_companies text[] not null default '{}',
  career_goals text not null default '',
  intro_pitch text not null default '',
  native_language text not null default '',
  english_second_language boolean not null default false,
  timezone text not null default 'America/Denver',
  mission_start date,
  mission_end date,
  mission_location text not null default '',
  mission_disclosure text not null default 'when_relevant'
    check (mission_disclosure in ('when_relevant', 'never')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mission_dates_ordered check (mission_end is null or mission_start is null or mission_end > mission_start)
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create an empty profile automatically when a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- contacts
-- ---------------------------------------------------------------------------

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  full_name text not null check (length(full_name) between 1 and 200),
  linkedin_url text not null default '',
  current_company text not null default '',
  current_position text not null default '',
  location text not null default '',
  industry text not null default '',
  how_connected text not null default '',
  linkedin_profile_text text not null default '' check (length(linkedin_profile_text) <= 60000),
  linkedin_experience_text text not null default '' check (length(linkedin_experience_text) <= 60000),
  linkedin_education_text text not null default '' check (length(linkedin_education_text) <= 20000),
  email_thread_text text not null default '' check (length(email_thread_text) <= 60000),
  personal_notes text not null default '' check (length(personal_notes) <= 20000),
  analysis jsonb,
  analysis_generated_at timestamptz,
  tags text[] not null default '{}',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_tsv tsvector generated always as (
    to_tsvector('english',
      coalesce(full_name, '') || ' ' || coalesce(current_company, '') || ' ' ||
      coalesce(current_position, '') || ' ' || coalesce(industry, '') || ' ' ||
      coalesce(how_connected, '') || ' ' || coalesce(personal_notes, ''))
  ) stored,
  unique (id, user_id)
);

create index contacts_user_idx on public.contacts (user_id, updated_at desc);
create index contacts_company_idx on public.contacts (user_id, lower(current_company));
create index contacts_search_idx on public.contacts using gin (search_tsv);

create trigger contacts_updated_at before update on public.contacts
  for each row execute function public.set_updated_at();

create table public.contact_experiences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  contact_id uuid not null,
  kind text not null check (kind in ('work', 'education')),
  organization text not null default '',
  title text not null default '',
  start_label text not null default '',
  end_label text not null default '',
  description text not null default '',
  position int not null default 0,
  source text not null default 'ai' check (source in ('ai', 'manual')),
  created_at timestamptz not null default now(),
  foreign key (contact_id, user_id) references public.contacts (id, user_id) on delete cascade
);

create index contact_experiences_contact_idx on public.contact_experiences (contact_id, position);
create index contact_experiences_user_idx on public.contact_experiences (user_id);

-- ---------------------------------------------------------------------------
-- meetings + interview scripts
-- ---------------------------------------------------------------------------

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  contact_id uuid not null,
  title text not null default '',
  scheduled_at timestamptz,
  duration_minutes int not null default 30 check (duration_minutes between 5 and 240),
  medium text not null default 'zoom' check (medium in ('zoom', 'phone', 'in_person', 'other')),
  status text not null default 'planned' check (status in ('planned', 'completed', 'cancelled')),
  script jsonb,
  script_generated_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (contact_id, user_id) references public.contacts (id, user_id) on delete cascade
);

create index meetings_user_idx on public.meetings (user_id, scheduled_at desc);
create index meetings_contact_idx on public.meetings (contact_id);

create trigger meetings_updated_at before update on public.meetings
  for each row execute function public.set_updated_at();

create table public.meeting_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  meeting_id uuid not null,
  section text not null check (section in ('career_journey', 'deep_dive', 'career_advice', 'closing')),
  question text not null check (length(question) between 1 and 2000),
  short_version text not null default '',
  why_relevant text not null default '',
  follow_up text not null default '',
  priority smallint not null default 2 check (priority between 1 and 3),
  evidence jsonb not null default '[]',
  include_in_short_call boolean not null default false,
  is_alternate boolean not null default false,
  asked boolean not null default false,
  edited boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (meeting_id, user_id) references public.meetings (id, user_id) on delete cascade
);

create index meeting_questions_meeting_idx on public.meeting_questions (meeting_id, position);
create index meeting_questions_user_idx on public.meeting_questions (user_id);

create trigger meeting_questions_updated_at before update on public.meeting_questions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- notes + AI summaries (append-only history)
-- ---------------------------------------------------------------------------

create table public.meeting_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  meeting_id uuid not null,
  contact_id uuid not null,
  body text not null check (length(body) between 1 and 40000),
  kind text not null default 'post_meeting' check (kind in ('post_meeting', 'live')),
  created_at timestamptz not null default now(),
  search_tsv tsvector generated always as (to_tsvector('english', body)) stored,
  foreign key (meeting_id, user_id) references public.meetings (id, user_id) on delete cascade,
  foreign key (contact_id, user_id) references public.contacts (id, user_id) on delete cascade
);

create index meeting_notes_meeting_idx on public.meeting_notes (meeting_id, created_at);
create index meeting_notes_user_idx on public.meeting_notes (user_id, contact_id);
create index meeting_notes_search_idx on public.meeting_notes using gin (search_tsv);

create table public.meeting_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  meeting_id uuid not null,
  contact_id uuid not null,
  source_note_ids uuid[] not null default '{}',
  summary text not null default '',
  key_points jsonb not null default '[]',
  advice jsonb not null default '[]',
  action_items jsonb not null default '[]',
  relationship_insights jsonb not null default '[]',
  resources jsonb not null default '[]',
  introductions_offered jsonb not null default '[]',
  reconnect_signals jsonb not null default '[]',
  offered_further_help boolean not null default false,
  topics jsonb not null default '[]',
  generated_by text not null default '',
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (meeting_id, user_id) references public.meetings (id, user_id) on delete cascade,
  foreign key (contact_id, user_id) references public.contacts (id, user_id) on delete cascade
);

create index meeting_summaries_meeting_idx on public.meeting_summaries (meeting_id, created_at desc);
create index meeting_summaries_user_idx on public.meeting_summaries (user_id, contact_id);

-- ---------------------------------------------------------------------------
-- follow-ups
-- ---------------------------------------------------------------------------

create table public.follow_up_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  contact_id uuid not null,
  meeting_id uuid,
  kind text not null check (kind in ('thank_you', 'intro_response', 'action_item', 'resource_followup',
    'reconnect', 'pre_mission_update', 'post_mission_reconnect', 'custom')),
  title text not null check (length(title) between 1 and 300),
  reason text not null default '',
  message_angle text not null default '',
  due_date date,
  timing_note text not null default '',
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  confidence text not null default 'medium' check (confidence in ('high', 'medium', 'low')),
  status text not null default 'suggested'
    check (status in ('suggested', 'accepted', 'snoozed', 'dismissed', 'completed')),
  rule_key text,
  source text not null default 'engine' check (source in ('engine', 'manual')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (contact_id, user_id) references public.contacts (id, user_id) on delete cascade,
  foreign key (meeting_id, user_id) references public.meetings (id, user_id) on delete cascade
);

-- The engine never recreates a recommendation the user already saw (even if dismissed).
-- (NULL rule_keys — manual tasks — are distinct, so they never conflict.)
create unique index follow_up_tasks_rule_key_idx on public.follow_up_tasks (user_id, rule_key);
create index follow_up_tasks_due_idx on public.follow_up_tasks (user_id, status, due_date);
create index follow_up_tasks_contact_idx on public.follow_up_tasks (contact_id);

create trigger follow_up_tasks_updated_at before update on public.follow_up_tasks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- message drafts (draft lifecycle is separate from sent status)
-- ---------------------------------------------------------------------------

create table public.message_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  contact_id uuid not null,
  meeting_id uuid,
  follow_up_task_id uuid,
  kind text not null check (kind in ('thank_you', 'linkedin_message', 'reconnection', 'advice_update',
    'post_mission_reconnection', 'action_followup')),
  tone text not null check (tone in ('professional', 'friendly', 'brief')),
  channel text not null default 'email' check (channel in ('email', 'linkedin')),
  subject text not null default '',
  body text not null check (length(body) <= 20000),
  status text not null default 'draft' check (status in ('draft', 'discarded')),
  sent_at timestamptz, -- set ONLY by an explicit "Mark as sent", never by copying
  generated_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (contact_id, user_id) references public.contacts (id, user_id) on delete cascade,
  foreign key (meeting_id, user_id) references public.meetings (id, user_id) on delete cascade,
  foreign key (follow_up_task_id, user_id) references public.follow_up_tasks (id, user_id)
    on delete set null (follow_up_task_id)
);

create index message_drafts_contact_idx on public.message_drafts (user_id, contact_id, created_at desc);
create index message_drafts_meeting_idx on public.message_drafts (meeting_id);

create trigger message_drafts_updated_at before update on public.message_drafts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- relationship timeline
-- ---------------------------------------------------------------------------

create table public.interaction_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  contact_id uuid not null,
  meeting_id uuid,
  kind text not null check (kind in ('contact_created', 'outreach_sent', 'reply_received', 'meeting_scheduled',
    'meeting_completed', 'message_sent', 'follow_up_completed', 'note')),
  occurred_at timestamptz not null default now(),
  summary text not null default '',
  created_at timestamptz not null default now(),
  foreign key (contact_id, user_id) references public.contacts (id, user_id) on delete cascade,
  foreign key (meeting_id, user_id) references public.meetings (id, user_id) on delete cascade
);

create index interaction_history_contact_idx on public.interaction_history (user_id, contact_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- knowledge base
-- ---------------------------------------------------------------------------

create table public.career_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  contact_id uuid not null,
  meeting_id uuid,
  summary_id uuid,
  insight text not null,
  topic text not null default '',
  source_quote text not null default '',
  created_at timestamptz not null default now(),
  search_tsv tsvector generated always as (
    to_tsvector('english', coalesce(insight, '') || ' ' || coalesce(topic, '') || ' ' || coalesce(source_quote, ''))
  ) stored,
  foreign key (contact_id, user_id) references public.contacts (id, user_id) on delete cascade,
  foreign key (meeting_id, user_id) references public.meetings (id, user_id) on delete cascade,
  foreign key (summary_id, user_id) references public.meeting_summaries (id, user_id)
    on delete set null (summary_id)
);

create index career_insights_user_idx on public.career_insights (user_id, topic);
create index career_insights_search_idx on public.career_insights using gin (search_tsv);

create table public.company_research (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company_name text not null check (length(company_name) between 1 and 200),
  notes text not null default '',
  summary text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, company_name)
);

create trigger company_research_updated_at before update on public.company_research
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- AI usage limits
-- ---------------------------------------------------------------------------

create table public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  count int not null default 0,
  primary key (user_id, day)
);

-- Atomic increment; runs with the caller's permissions so RLS still applies.
create or replace function public.increment_ai_usage(p_day date)
returns int
language sql
security invoker
set search_path = ''
as $$
  insert into public.ai_usage (user_id, day, count)
  values (auth.uid(), p_day, 1)
  on conflict (user_id, day) do update set count = public.ai_usage.count + 1
  returning count;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
create policy "profiles: owner can read" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: owner can update" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "profiles: owner can insert" on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));

do $$
declare
  t text;
begin
  foreach t in array array[
    'contacts', 'contact_experiences', 'meetings', 'meeting_questions', 'meeting_notes',
    'meeting_summaries', 'follow_up_tasks', 'message_drafts', 'interaction_history',
    'career_insights', 'company_research', 'ai_usage'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "%s: owner only" on public.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))',
      t, t);
  end loop;
end;
$$;

-- Anonymous visitors get nothing. (The public demo never touches this database.)
revoke all on all tables in schema public from anon;
revoke execute on function public.increment_ai_usage(date) from anon, public;
grant execute on function public.increment_ai_usage(date) to authenticated;
