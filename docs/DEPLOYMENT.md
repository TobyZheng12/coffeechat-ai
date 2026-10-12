# Deployment (Vercel + Supabase)

> **Current production setup:** Vercel project `coffeechat-ai` → https://coffeechat-ai-six.vercel.app, Supabase project `coffeechat-ai` (ref `wctqtgtogvlogwbaixqa`, region `us-east-1`, free tier). AI runs on the free offline templates (`AI_PROVIDER=mock`); no Anthropic key is configured, so there are no AI costs.
>
> Free tiers of Supabase and Vercel are enough for personal use. Note: free Supabase projects pause after about a week without activity; open the dashboard to resume one.

## 1. Supabase

1. Create a project at <https://supabase.com>.
2. Apply the schema (every file in `supabase/migrations/`, in order). Either:
   - **SQL editor**: paste and run each migration file, or
   - **CLI**: `supabase db query --linked --project-ref <ref> -f supabase/migrations/<file>.sql` (uses your CLI login via the Management API), then run `supabase db advisors --linked --project-ref <ref>` to check security.
3. **Authentication → Providers → Email**: keep it enabled (magic links). Optionally disable "Allow new users to sign up" after your first sign-in.
4. **Authentication → URL configuration** (or edit `[remotes.production.auth]` in `supabase/config.toml` and run `supabase config push --project-ref <ref>`):
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
| `AI_PROVIDER` | `mock` for free offline templates, or `auto` with a key below |
| `ANTHROPIC_API_KEY` | optional, from <https://console.anthropic.com> (billed by usage) |
| `AI_DAILY_LIMIT` | e.g. `60` |
| `DEMO_ENABLED` | `true` to show the public demo |
| `DEMO_AI` | `mock` (recommended: the demo never spends your API credits) |

4. Deploy. Then verify:
   - `/` loads, `/demo` shows fictional data.
   - `/app` redirects to `/login`; your email receives a link; signing in shows an empty workspace.
   - Supabase's built-in email sender only delivers to members of your Supabase organization and is rate-limited (a few emails per hour). For anything beyond personal use, configure custom SMTP in Supabase → Authentication → Emails.
   - After your first sign-in, consider turning off **Allow new users to sign up** (Authentication → Providers → Email) so no one else can create an auth account in your project. The app already rejects any email not in `ALLOWED_EMAILS`.
   - An email not in `ALLOWED_EMAILS` gets the same "check your inbox" message but no link.

## 3. Portfolio link

Link to `https://<your-app>.vercel.app` (landing page) or directly to `https://<your-app>.vercel.app/demo`.

## Notes

- Demo workspaces live in server memory. On serverless platforms a cold start can reset a visitor's demo; the banner tells visitors that demo data is temporary.
- Local mode (`DATA_BACKEND=local`) is disabled in production by design.
