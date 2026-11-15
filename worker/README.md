# Pull-request service

This Cloudflare Worker keeps GitHub credentials out of the static site. It uses GitHub OAuth, restricts access to configured GitHub users, stores short-lived server-side sessions in KV, checks CSRF and request origin, edits `go/redirects.csv` on a branch, and opens a pull request.

## Live setup

1. In GitHub **Settings → Developer settings → OAuth Apps**, create an OAuth App:
   - Homepage: `https://andrewandrade.ca/teacher-tools/`
   - Callback: `https://teacher-tools-api.andrewandrade.ca/auth/callback`
2. Copy `wrangler.example.jsonc` to `wrangler.jsonc`.
3. Create a Cloudflare KV namespace and replace `REPLACE_WITH_KV_NAMESPACE_ID`:
   - `npx wrangler kv namespace create SESSIONS`
4. Add the OAuth client ID as `GITHUB_CLIENT_ID` in `wrangler.jsonc` under `vars`.
5. Store the client secret only as a Worker secret:
   - `npx wrangler secret put GITHUB_CLIENT_SECRET`
6. Deploy the Worker, attach the custom domain `teacher-tools-api.andrewandrade.ca`, and confirm `https://teacher-tools-api.andrewandrade.ca/health` returns `{"ok":true}`.
7. Set `prApiBase` in `site/config.js` to `https://teacher-tools-api.andrewandrade.ca`, commit, and redeploy Teacher Tools.

The OAuth scope is `public_repo`, not full private-repository access. Sessions expire after eight hours. Only usernames in `ALLOWED_GITHUB_USERS` can complete authorization.

