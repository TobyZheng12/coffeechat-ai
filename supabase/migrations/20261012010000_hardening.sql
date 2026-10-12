-- Hardening after running the Supabase database advisor.

-- 1. The sign-up trigger function must only ever run as a trigger, never via
--    the REST API (/rest/v1/rpc/handle_new_user).
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;

-- 2. Covering indexes for the composite ownership foreign keys, so cascading
--    deletes and joins stay fast as the network grows.
create index if not exists contact_experiences_fk_idx on public.contact_experiences (contact_id, user_id);
create index if not exists meetings_fk_contact_idx on public.meetings (contact_id, user_id);
create index if not exists meeting_questions_fk_idx on public.meeting_questions (meeting_id, user_id);
create index if not exists meeting_notes_fk_meeting_idx on public.meeting_notes (meeting_id, user_id);
create index if not exists meeting_notes_fk_contact_idx on public.meeting_notes (contact_id, user_id);
create index if not exists meeting_summaries_fk_meeting_idx on public.meeting_summaries (meeting_id, user_id);
create index if not exists meeting_summaries_fk_contact_idx on public.meeting_summaries (contact_id, user_id);
create index if not exists follow_up_tasks_fk_contact_idx on public.follow_up_tasks (contact_id, user_id);
create index if not exists follow_up_tasks_fk_meeting_idx on public.follow_up_tasks (meeting_id, user_id);
create index if not exists message_drafts_fk_contact_idx on public.message_drafts (contact_id, user_id);
create index if not exists message_drafts_fk_meeting_idx on public.message_drafts (meeting_id, user_id);
create index if not exists message_drafts_fk_task_idx on public.message_drafts (follow_up_task_id, user_id);
create index if not exists interaction_history_fk_contact_idx on public.interaction_history (contact_id, user_id);
create index if not exists interaction_history_fk_meeting_idx on public.interaction_history (meeting_id, user_id);
create index if not exists career_insights_fk_contact_idx on public.career_insights (contact_id, user_id);
create index if not exists career_insights_fk_meeting_idx on public.career_insights (meeting_id, user_id);
create index if not exists career_insights_fk_summary_idx on public.career_insights (summary_id, user_id);

-- The single-column indexes these replace.
drop index if exists public.meetings_contact_idx;
drop index if exists public.follow_up_tasks_contact_idx;
drop index if exists public.message_drafts_meeting_idx;
