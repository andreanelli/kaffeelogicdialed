# Releasing Dialed

GitHub Actions runs tests and a production build for pull requests and pushes to `main`. A push to `main` that increases the root `package.json` version also builds the cloud app and deploys it to https://dialed-roast-lab.pages.dev/. Ordinary code pushes do not deploy. The workflow compares against the commit before the entire push, so a bump can be included in a multi-commit push or merged pull request.

## One-time setup

In repository Settings → Secrets and variables → Actions, configure:

| Type     | Name                     | Value                                                                                         |
| -------- | ------------------------ | --------------------------------------------------------------------------------------------- |
| Secret   | `CLOUDFLARE_API_TOKEN`   | Cloudflare API token with Account → Cloudflare Pages → Edit, restricted to the Dialed account |
| Variable | `VITE_SUPABASE_URL`      | `https://wmandqqoqxkiotgsvegd.supabase.co`                                                    |
| Variable | `VITE_SUPABASE_ANON_KEY` | Public anon key from the existing `.env.cloud.local` or Supabase project settings             |

The account ID and Pages project name are public and configured in `.github/workflows/release.yml`. The Supabase anon key is public browser configuration. Never use the service-role key here. Production runtime secrets already belong to Cloudflare and are preserved across deployments. The local Wrangler OAuth login cannot authenticate GitHub Actions.

Enable GitHub Actions for the repository. The workflow uses the `production` environment; optionally configure required reviewers there if manual approval is desired. Protect `main` with the `checks` job as a required check when your repository plan supports it.

## Publish a release

Develop and review changes on a `codex/<change-name>` branch. Bump the version in the same pull request as the changes, or on current `main` after merging:

```sh
npm version patch --no-git-tag-version
 git add package.json package-lock.json
 git commit -m "Release next patch"
 git push origin main
```

Run these commands from `main` when releasing directly. Use `minor` for a feature release, or an explicit version. Only stable `major.minor.patch` versions are supported. Both lockfile version fields must match; version decreases fail checks. Do not push unrelated commits while a release is deploying: the deployment job requires its commit still to be the tip of `main`.

In GitHub → Actions, wait for both `checks` and `deploy` to pass. The deployment step prints the Cloudflare deployment URL; the run summary records the version and commit. Check the live app: sign-in, journal, roast dashboard and a representative save. Verify signed-out API requests remain denied. Optionally tag that exact successful commit and create a GitHub Release with changes and the Cloudflare deployment ID. Tags alone do not deploy.

If deployment fails because configuration is missing, fix the repository settings and rerun the failed job while the commit is still current. If `main` has advanced, publish a new version from current `main`. The workflow serializes deployment jobs and refuses stale commits. No database migrations run automatically.

## Data and migrations

Never commit `.env` files, passwords, service-role keys, local databases or private exports. Avoid giving preview deployments production database credentials; use a separate test project with disposable data.

Database changes belong in new, ordered files under `supabase/migrations/`. Do not edit an already applied migration to update production. Back up the notebook before applying a migration, prefer changes compatible with both the old and new app, and verify the data afterward. The initial local-to-cloud migration script accepts only an empty workspace; it is not a routine release step or a restore tool.

## Recovery and manual deployment

For an application regression, revert the offending code and publish a new patch version. Keep the package version increasing. Application rollbacks do not reverse database migrations or recover deleted records; handle data recovery separately using a verified backup.

For emergency manual deployment, use a clean checkout, the public Supabase configuration in ignored `.env.cloud.local`, and `npm run deploy:cloud` with an authenticated Wrangler session. Record the exact commit and deployment ID. The next automated release will replace this manual deployment.

Cloudflare's [CI deployment guide](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/) describes the required token permissions.
