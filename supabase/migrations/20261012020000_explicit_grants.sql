-- Make table access explicit instead of relying on Supabase's default grants.
-- Signed-in users can reach the tables; Row Level Security then limits every
-- query to their own rows. Anonymous visitors get nothing.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;
