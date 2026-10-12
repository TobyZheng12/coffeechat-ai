# Deployment (Vercel + Supabase)

> Nothing here has been deployed yet. These steps create accounts and may involve costs on your side, so do them when you're ready. Free tiers of Supabase and Vercel are enough for personal use. Claude API usage is billed by Anthropic.

## 1. Supabase

1. Create a project at <https://supabase.com>.
2. Apply the schema. Either:
   - **SQL editor**: paste and run `supabase/migrations/20261012000000_init.sql`, or
   - **CLI** (already installed on this machine): `supabase link --project-ref <ref>` then `supabase db push`.
3. **Authentication → Providers → Email**: keep it enabled (magic links). Optionally disable "Allow new users to sign up" after your first sign-in.
4. **Authentication → URL configuration**:
   - Site URL: `https://<your-app>.vercel.app`
   - Redirect URLs: `https://<your-app>.vercel.app/auth/callback` (and `http://localhost:3000/auth/callback` for local testing)
5. Copy **Project URL** and **publishable (anon) key** from Project Settings → API.

## 2. Vercel

1. Push the repository to GitHub (private or public — your choice; no secrets are committed).
2. Import it at <https://vercel.com/new>. The framework is detected automatically.
3. Environment variables (Production):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | from Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | from Supabase |
| `ALLOWED_EMAILS` | your email (comma-separate if more) — **required** |
| `NEXT_PUBLIC_SITE_URL` | `https://<your-app>.vercel.app` |
| `ANTHROPIC_API_KEY` | from <https://console.anthropic.com> |
| `AI_DAILY_LIMIT` | e.g. `60` |
| `DEMO_ENABLED` | `true` to show the public demo |
| `DEMO_AI` | `mock` (recommended: the demo never spends your API credits) |

4. Deploy. Then verify:
   - `/` loads, `/demo` shows fictional data.
   - `/app` redirects to `/login`; your email receives a link; signing in shows an empty workspace.
   - An email not in `ALLOWED_EMAILS` gets the same "check your inbox" message but no link.

## 3. Portfolio link

Link to `https://<your-app>.vercel.app` (landing page) or directly to `https://<your-app>.vercel.app/demo`.

## Notes

- Demo workspaces live in server memory. On serverless platforms a cold start can reset a visitor's demo; the banner tells visitors that demo data is temporary.
- Local mode (`DATA_BACKEND=local`) is disabled in production by design.
