# Verification — 11 September 2026

## Automated

- Production TypeScript/Vite build passed.
- 13 Node integration tests passed with isolated SQLite databases and temporary directories.
- Tests exercise actual HTTP handlers over ephemeral localhost ports, not mocked response objects.
- Archive round trips include non-UTF-8 bytes.
- Folder tests verify symlink skipping, idempotent import, exclusive output creation, byte fidelity, and overwrite refusal.
- No hardware test was performed.

## Browser

Using the Codex in-app browser against the running local frontend and API:

- Empty notebook renders with explicit sample-data opt-in.
- Loading samples displays six roasts, four tastings, and labeled sample curves.
- Created a new research profile, then saved an independently numbered second revision.
- Connected the simulator and synced the new revision; UI showed the simulated completion and history entry.
- At a 390 × 844 viewport, created a coffee lot, logged a roast using the new profile revision, and added a named tasting with notes.
- After a full reload, the coffee lot retained its adjusted stock of 900 g from an initial 1,000 g and a 100 g roast.
- The tasting appeared on the cupping table, linked to the correct roast; the pending-tasting count decreased.
- A roast without supplied measurements displayed a missing-data message, not a generated target curve.
- Mobile document width matched the 390 px viewport; navigation and wide tables use contained horizontal scrolling.
- Desktop and mobile screenshots were inspected. No browser error/warning logs appeared in the exercised workflow.
- Temporary browser QA records were removed after verification; illustrative notebook data remains available for preview.

The 1280 × 720 desktop and 390 × 844 mobile layouts were visually checked. Full WCAG auditing, all browser engines, remote multiuser use, live Studio sync-folder behavior, and direct USB-C operation remain unverified.

## Phase 2 verification

- 24 automated tests cover the notebook regressions plus native byte-preserving revisions, unsupported schemas, malformed measurement rows, offsets, start/end dates, CSV quoting and conversions, nullable tasting scores, duplicate/conflict handling, stale previews, atomic imports, protected rollback, and unchanged current inventory for historical records and edits.
- The local corpus contains 17 profiles and 19 logs. All 17 profiles pass byte-exact no-op export and selective-name-edit parsing. Four logs report incomplete metadata. Studio source files were read without modification; archive copies remain in the ignored local database.
- Browser: inspected `log0015.klog`, its 819 measurement samples, recorded channel units, metadata and events. The inspector explicitly explains unapplied Studio offsets.
- Browser: mapped a synthetic CSV, previewed dates and weights, committed one roast and a tasting with no score, verified the journal showed “Tasted · no score”, then rolled the batch back. Temporary CSV and QA import metadata were removed.
- Browser: imported the archived WashedAllPurpose profile and inspected its native revision editor. Its original revision remains in the library.
- Mobile: the import page rendered at 390 × 844 with document width equal to viewport width. The temporary viewport override was reset.
- No browser error or warning logs appeared in the exercised phase 2 workflows.

Studio-open verification of edited exports remains pending: native app automation did not yield a reliable compatibility check. Exports are labeled for Studio review. Direct USB, device writes, and physical roast behavior were not tested. The actual shared-sheet migration awaits its data; the implemented migration path uses CSV exports.

## Roast dashboard — 13 September 2026

Replaced the native log channel selector with four simultaneous, aligned plots: temperature (actual/target/mean/spot), rate of rise (actual/target/controller desired), heater power, and fan speed (actual/embedded profile). Added shared cursor with keyboard slider, curve visibility controls, cooling range, event markers, phase durations, development percentage and end-temperature summary. RoR detail scale explicitly marks off-scale values and offers full range; constant channels receive nonzero axis spans. Recorded offsets remain unapplied and disclosed.

Verified against a complete 819-sample roast and a six-sample incomplete log in the browser. Checked desktop and 390 px mobile containment, readable mobile SVG coordinate system, keyboard cursor updates, Enter-activated curve visibility, cooling extent, missing-event metrics, and absence of invalid SVG paths or browser warnings. Production build passed. The journal no longer shows an empty-notebook prompt underneath recorded device history.

## Cupping selection and deletion — 16 September 2026

The tasting selector now accepts cataloged device runs as well as full notebook roasts, with source filenames/dates to distinguish repeated profiles. Runs have a direct Record tasting action. Existing run tastings move to the linked roast when its notebook details are imported. No weights are invented.

Manage records provides filtered deletion with explicit confirmation for coffees, profiles/revisions, roasts, runs, experiments, tastings, original files and simulator records. Dependencies block deletion with named references; profile deletion includes unused revisions. Stock is restored only for consumed manual roasts. Deleted run IDs are remembered to prevent catalog refresh from recreating them. Import audit records remain but affected rollback is disabled.

31 regression tests passed before final simulator-category expansion. Browser verification saved a temporary tasting against WashedAP/log0015 and displayed its correct name, then checked the exact-entry deletion confirmation. Temporary tasting was removed; all 17 runs, two purchased coffees and 36 files remained. No real user entry was deleted.

## Cloud preparation — 16 September 2026

- 35 tests pass, including the existing SQLite regression suite and four cloud tests.
- Actual migration SQL exercised in PGlite PostgreSQL: anonymous and non-member access denied, member reads allowed, browser writes denied, commit restricted to the service role, stale revisions rejected.
- Local Cloudflare Pages runtime compiled and served the cloud login screen; desktop appearance inspected. Unconfigured API returns 503 without revealing notebook data.
- Production TypeScript/Vite build passes. The cloud preview build uses dummy public configuration only; no hosting credentials have been provided.
- Migration export created under ignored `data/backups/`: 70 entities, 36 original files, 17 import keys, one metadata entry. All original-file SHA-256 hashes verified. Export-only operation; no cloud data written.
- Existing notebook loaded through the cloud route adapter with a local snapshot: two beans, 17 profiles, 17 device runs and 36 files.
- Cloudflare and Supabase dashboards are signed in. Supabase project creation awaits a user-entered database password; the Pages-only Wrangler authorization awaits user action. Remote deployment, account membership provisioning, end-to-end authentication, migration readback, and actual free-tier resource checks remain pending.

## Live hosting — 16 September 2026

- Cloudflare Pages project created and deployed: https://dialed-roast-lab.pages.dev (deployment `926b4f28`). Login page verified in browser.
- Actual SQL migration installed transactionally in Supabase project `wmandqqoqxkiotgsvegd`; workspace `9081fff0-fa2b-4abe-b715-bdb5bde93a56` created.
- Production API `/api/state` and `/api/backup` return 401 without sign-in. Direct anonymous database table reads and both RPC calls return 401.
- Public signup disabled and verified through Auth settings API. Four runtime secrets uploaded to Cloudflare production without printing key values.
- User account password creation remains a user handoff. No notebook data uploaded yet; signed-in access, full migration verification and real Cloudflare CPU checks remain pending.

## Hosted access follow-up — 16 September 2026

- Three Auth accounts now exist, but their workspace membership rows are absent; this explains the authenticated 403 shown in the screenshot.
- Membership assignment is awaiting explicit user confirmation of the three recipients and edit/delete access after automatic approval review rejected the update. No membership rows have been added and migration has not run.
- Cloud-only labels now say “Shared workspace” / “Shared roast lab”; cloud connection errors no longer suggest running a local backend. TypeScript/cloud build passed and correction deployed as `cd9b5b84`.

## Access resolved and migration completed — 16 September 2026

- User explicitly approved full access for all three listed accounts. Added exactly those three workspace membership rows through the database owner and verified their count.
- Migrated the latest local notebook: 72 entities, 37 original files, 17 import keys and one metadata entry. A new private local backup was saved before upload; every uploaded record and original byte sequence was read back and compared successfully.
- Signed-in production browser loads the journal: 17 recorded device sessions plus the latest manually recorded roast. Native log0017 dashboard loads 792 samples, including temperature, RoR, heater and fan panels.
- Local database retained intact. Temporary local service-role credential file removed after successful migration. Detailed production CPU profiling and write-through browser testing remain outside this verification.

## Manual roast → device run workflow — 16 September 2026

- Manual roast creation/editing now synchronizes a linked device-run record in the same transaction as the roast and inventory update.
- Existing manual roasts without a run are included in the journal's run projection; editing persists their linked run.
- Run rows expose “Add details / log” or “Edit details”. The roast editor uploads `.klog` files directly, then attaches them on Save. Uploading without saving preserves the file in the archive without modifying the roast.
- Attaching a previously cataloged log merges its run into the manual entry, preserves alternate originals, and moves tasting references. Cataloging again does not duplicate the linked run. Logs already assigned to another roast are rejected atomically.
- Deleting a roast removes its linked run after dependency checks and restores inventory once. Deleting a run explicitly suppresses the legacy projection.
- All 37 tests and cloud TypeScript/Vite build pass, including manual creation, late attachment, catalog re-run, stock preservation, duplicate rejection, deletion and legacy history visibility.
