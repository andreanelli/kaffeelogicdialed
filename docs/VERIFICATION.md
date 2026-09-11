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
