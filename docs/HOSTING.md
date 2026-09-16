# Dialed on Cloudflare Pages + Supabase

Live address: `https://dialed-roast-lab.pages.dev`. The authenticated frontend and API are deployed. All three approved accounts have workspace access. The local notebook has been migrated and verified, and the signed-in journal and native roast dashboard load successfully.

Cloudflare project: `dialed-roast-lab`. Supabase project: `wmandqqoqxkiotgsvegd` (Dialed, eu-west-2). Workspace: `9081fff0-fa2b-4abe-b715-bdb5bde93a56`. The schema is installed; public signup is disabled. The three approved Auth accounts are linked to the workspace. Runtime secrets are configured in Cloudflare production. The public build configuration `.env.cloud.local` is ignored and mode 0600. The temporary server-secret file was removed after migration; production secrets remain in Cloudflare.

The Pages frontend is public; all notebook API routes require a valid Supabase session and membership in one configured workspace. PostgreSQL row-level security prevents anonymous or non-member reads. Browser roles cannot write tables or call the commit function. The Pages function validates input using the same domain routes as the local app, then commits through a server-only key. Every commit locks and increments a workspace revision; concurrent edits return 409 instead of silently replacing somebody else's work.

## 1. Supabase project

Create a Free project in a region near Switzerland. In its SQL editor run `supabase/migrations/202609160001_notebook.sql` once. Disable public signups in Authentication settings. Create the three users through Supabase's user management and arrange their initial passwords privately; do not commit credentials. Email invitations/password recovery require working email delivery configuration; do not assume the default email service is production-ready.

Create a workspace and add the three users using their Auth user UUIDs, not email addresses:

```sql
insert into public.dialed_workspaces(name) values ('Dialed') returning id;
-- Substitute the workspace UUID and actual Auth user UUIDs:
insert into public.dialed_members(workspace_id,user_id) values
 ('WORKSPACE_UUID','USER_1_UUID'),
 ('WORKSPACE_UUID','USER_2_UUID'),
 ('WORKSPACE_UUID','USER_3_UUID');
```

Membership grants equal access to the shared notebook, including deletion. There is no public registration or membership-management UI. Remove a membership row to revoke access on the next API request. Set the Auth site URL to the deployed Pages URL.

## 2. Cloudflare configuration

Copy `.env.cloud.example` to `.env.cloud.local` and set the public Supabase URL and anon/publishable key. The cloud build script rejects missing configuration. Only `VITE_` values enter the browser bundle; never prefix a secret key with `VITE_`.

Authenticate the official CLI with `npx wrangler login`. Create the project with `npx wrangler pages project create dialed-roast-lab --production-branch main`. If the name is unavailable, choose another and update `wrangler.jsonc` and `deploy:cloud` in package.json.

Use Cloudflare's Pages settings or the interactive `wrangler pages secret put NAME --project-name dialed-roast-lab` prompts to set these runtime secrets for production (and previews only if you want previews to access the same live notebook):

- `SUPABASE_URL`: project URL
- `SUPABASE_ANON_KEY`: the same public key
- `SUPABASE_SERVICE_ROLE_KEY`: server-only legacy service-role key
- `DIALED_WORKSPACE_ID`: the workspace UUID

No secrets are stored in `wrangler.jsonc`. Missing runtime settings return 503; they never enable anonymous access. Do not give untrusted preview branches production secrets.

## 3. Migrate the existing notebook

Run `node scripts/migrate-cloud.js` to create a private snapshot under ignored `data/backups/`. It includes entity IDs, native bytes, file hashes, import deduplication keys, and metadata such as deleted-run tombstones. It validates all source file hashes. Keep a separate offline copy: this is your migration recovery file. The local database remains intact.

To upload, provide the runtime variables above in your shell plus `DIALED_MIGRATION_USER_ID` (one member's Auth UUID), then run:

```sh
node scripts/migrate-cloud.js --upload
```

Never paste secret values into chat or commit them. Upload is allowed only to an empty workspace at revision zero. It commits atomically and reads every uploaded record back for comparison, including file content. It will refuse a second upload rather than overwrite existing cloud work. Do not let the team edit during migration/verification. An upload failure keeps the local backup. If the write succeeded but verification failed, investigate before retrying or removing anything.

## 4. Deploy and verify

```sh
npm test
npm run deploy:cloud
```

Before sharing the URL, verify on the actual services:

1. Signed-out API requests and original-file downloads return 401.
2. Each of the three members can sign in and see the migrated notebook.
3. A signed-in non-member gets 403 and cannot read the underlying tables.
4. Create and delete a temporary cupping, and download an original log; compare its SHA-256 hash with the local copy.
5. Try concurrent edits: one may receive a refresh-and-retry message (409).
6. Check real request CPU/memory, database size and free-tier usage after browsing charts and importing a representative log. No paid upgrades are required by this configuration; stay within provider quotas.

`npm run build` remains the local build. `npm run build:cloud` enables authentication. The hosted device page explains the download/Studio/upload workflow. USB transport and local folders are unavailable from Pages; the local app remains usable.

## Storage and operating limits

This first hosted version loads a workspace snapshot per request and stores original bytes as base64 in private PostgreSQL rows. That keeps imports/deletes atomic and preserves existing file handling, but increases database use and request memory. Native files count against the database allowance, not Supabase Storage. This is intended for a small shared notebook; large archives will need lazy file loading and object storage. Cloudflare free CPU limits still need validation on a real deployment with this notebook.

The free plans have quotas; Supabase may pause inactive free projects. Free hosting does not provide guaranteed uptime or managed daily recovery for this app. Download backups regularly. The app's normal backup exports records/files; the migration snapshot additionally captures internal import keys and metadata. There is no automated cloud restore UI yet.

## Local verification

`tests/cloud.test.js` runs the actual migration SQL in embedded PostgreSQL (PGlite) with separate anonymous, authenticated and service roles. It verifies membership isolation, denied browser writes, service-only commit, stale revision rejection, request authentication and unit-of-work rollback. Existing SQLite API/import tests still exercise the local behavior. These tests do not replace checking the deployed Supabase configuration.
