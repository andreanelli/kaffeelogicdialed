# Releasing Dialed

GitHub holds source code. Cloudflare Pages runs the frontend and API, while Supabase holds the shared notebook. The current deployment process is manual through Wrangler; pushing a commit does not run the deployment script. No automated release workflow is configured in this repository.

## Recommended workflow

1. Develop on a `codex/<change-name>` branch and review changes before merging into `main`.
2. Run `npm ci`, `npm test`, and `npm run build:cloud`. The cloud build needs the public Supabase configuration in ignored `.env.cloud.local`.
3. For a release, update the package version and lockfile together (`npm version <version> --no-git-tag-version`), summarize the changes and validation, then commit and push `main`.
4. Deploy from a clean `main` checkout with `npm run deploy:cloud`. Confirm Wrangler targets production and records the intended commit SHA. Do not use `--commit-dirty=true` for routine releases.
5. Check the live app: sign-in, journal, profile/log dashboard, and a representative save. Verify that signed-out API calls are still denied.
6. Once verified, tag that exact commit (`git tag -a v<version> -m 'Dialed v<version>'`, then `git push origin v<version>`). Create a GitHub Release from the tag with changes, migration requirements and known limitations. Record the Cloudflare deployment ID alongside it.

Use patch versions for fixes (for example `0.1.1`), minor versions for new features (`0.2.0`), and document breaking changes clearly while the app is pre-1.0. The package currently says `0.1.0`; the next release version should be chosen explicitly. A code snapshot commit alone is not a published release.

## Data and migrations

Never commit `.env` files, passwords, service-role keys, local databases or private exports. Cloudflare production runtime secrets are configured independently of Git. Avoid giving preview deployments production database credentials; a preview should use a separate test project with disposable data.

Database changes belong in new, ordered files under `supabase/migrations/`. Do not edit an already applied migration to update production. Back up the notebook before applying a migration, prefer changes compatible with both the old and new app, and verify the data afterward. The initial local-to-cloud migration script accepts only an empty workspace; it is not a routine release step or a restore tool.

## Recovery

Keep the previous release tag and Cloudflare deployment ID. For an application regression, redeploy a clean checkout of the previous tag after checking that it works with the current database schema. Reverting application code does not reverse a database migration or recover deleted records. Handle data recovery separately using a verified backup and an explicit restore plan.

Automatic deployment from GitHub can be added later. Start with automated tests on pull requests, then a deliberate production deployment step after checks pass. Keep the same requirement to associate each production deployment with an exact commit.
