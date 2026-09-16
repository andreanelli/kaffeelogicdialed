# Dialed — the home roasting lab

A working local-first foundation for a shared home-roasting brand, built around the Kaffelogic Nano 7 **USB-C Connect**. React + TypeScript frontend, Express API, SQLite storage. Designed to turn scattered files and tasting notes into an experiment → roast → cup → revision loop.

**This is an initial application, not a complete replacement for Kaffelogic Studio.** Native profile/log inspection, selective native revisions, and CSV history import are implemented. Direct USB transport and Studio-open compatibility verification remain pending. The interface explicitly distinguishes research profiles, archived originals, simulated synchronization, and staged files.

## Run

Node.js 22.13 or later is required for `node:sqlite` (tested here with Node 23.10).

```sh
npm install
npm run dev
```

Open **http://127.0.0.1:5173**. The API listens on `127.0.0.1:3001`. Frontend changes reload automatically; restart the command after backend changes.

For the built application:

```sh
npm run build
npm start
```

Open **http://127.0.0.1:3001**. Both local servers bind only to loopback and have no authentication; do not expose them publicly. For authenticated hosting on Cloudflare Pages and Supabase, see [Hosting setup](docs/HOSTING.md). The cloud implementation is prepared; account setup, deployment, and live-service verification are still required.

## Start a notebook

1. Add a coffee lot under **Green coffee**, with available weight in grams.
2. Create a **Profile** with temperature/fan control points. These are Dialed research profiles, not roaster-ready Kaffelogic files.
3. Optionally create an **Experiment**: hypothesis, variable, and status.
4. **Log a roast**, choosing the exact profile revision and an optional experiment/log attachment. Stock is deducted transactionally.
5. Record one or more tastings with a named taster in **Cupping table**.
6. Edit a profile into a new immutable revision, compare roast curves, and record an experiment conclusion.

The empty notebook offers an explicit **Explore sample notebook** button. Sample data is illustrative and labeled. Sample cleanup preserves unrelated user records and refuses to break references from your own records. Editing a sample coffee lot, experiment, or roast promotes that record to your own data; using sample profiles can prevent sample removal to retain history.

## Working without the roaster

**Device & sync → Connect simulator** enables local profile sync. It stores exact revision IDs and checksums, detects repeat uploads, and records a sync history. Nothing is sent to hardware. Connection state resets when the backend restarts; stored simulated profiles and jobs persist.

The folder adapter can be exercised with ordinary temporary folders:

```sh
mkdir -p /tmp/dialed-import /tmp/dialed-outbox
DIALED_IMPORT_DIR=/tmp/dialed-import DIALED_PROFILE_OUTBOX=/tmp/dialed-outbox npm run dev
```

Put your own native files in the import directory, then click **Import folder**. Import is read-only, recursive to five levels, limited to 2,000 entries and 10 MB per file, and skips symbolic links. `.kpro`, `.kpro2`, and `.klog` extensions are accepted as opaque original files; accepting an extension does not certify its format.

**File archive → Stage original** copies an archived `.kpro` or `.kpro2` to the configured outbox. It uses exclusive creation, refuses existing filenames, and checks the bytes after writing. It does not validate roast settings or confirm device delivery. Use an independent outbox initially; review/open the file in Studio before using Studio's Save to roaster workflow. Studio remains the USB-C communication bridge.

Do not assume the USB-C Connect roaster mounts as a disk. Use Studio's **Tools → Open roaster sync folders** to identify its actual local folders when the device is available. Actual Studio-folder behavior is still unverified here.

## Import / export

- **Native files:** originals archived byte-for-byte and SHA-256 deduplicated. Inspect known text profile schemas 1.4/1.6 and log schemas 1.7/1.8; view recorded channels, events, settings and native Bézier curves. Import profiles with their original settings, or add logs after supplying the actual coffee lot and weights. Selective native revisions preserve untouched fields and original bytes. Edited exports are for Studio review; compatibility has not yet been certified.
- **Dialed profiles:** versioned JSON with explicit `format: "dialed-profile"` and `formatVersion: 1`; supported import/export round trip.
- **CSV history:** export a sheet as UTF-8 CSV, then use **Import history** to map columns, choose dates/units, resolve coffee lots and exact revisions, and review before committing. Duplicate imports are detected; conflicts and invalid rows block saving. Missing tasting scores remain unknown. Historical records do not consume current inventory. Batch rollback refuses to remove edited or subsequently referenced records. Direct Google Sheets synchronization is not implemented.
- **Measured curves:** optionally paste `time_seconds,temperature_celsius` lines in the roast editor. These are independent measurements; profile targets are never substituted for roast observations.
- **Workspace export:** JSON containing all records and base64 original files. JSON restore is not implemented.

A small research-only JSON fixture is in `fixtures/research-profile.json`.

## Persistence and backups

The database is `data/dialed.sqlite` by default; `DIALED_DATA_DIR` changes its directory. Records and original bytes live together so a workspace is portable. Data and dependencies are git-ignored.

For a restorable backup, **stop the backend and copy the entire data directory**, including any SQLite WAL/SHM files. To restore, stop the backend and replace the data directory from that copy before restarting. Keep multiple dated copies. The downloadable JSON is an additional portable export, not a one-click restore mechanism.

## Validation

```sh
npm test
npm run build
npm run format:check
```

The integration tests create isolated databases, temporary folders, and ephemeral localhost HTTP servers. They cover revision immutability, multiple tastings, inventory accounting and rollback, reference validation, upload fidelity/deduplication, JSON round trips, simulator state/idempotency, sample cleanup, origin restrictions, restart persistence, and outbox conflicts. They require permission to bind localhost sockets.

Native codec, import conversion, conflict, atomicity and rollback tests are included. Browser verification is recorded in `docs/VERIFICATION.md`; format limits and import instructions are in `docs/IMPORTS.md`.

## Project map

- `src/` — responsive React interface, editors, SVG temperature plots, API client.
- `server/app.js` — validated HTTP API and service operations.
- `server/db.js` — SQLite persistence and transactions.
- `server/device.js` — simulator and Studio-folder adapters.
- `server/schema.js` — domain validation.
- `server/files.js` — original file preservation and content-addressed deduplication.
- `docs/PLAN.md` — product architecture, phased implementation plan, acceptance criteria.
- `docs/DEVICE.md` — confirmed device facts, evidence, and hardware investigation checklist.

Dialed is an independent project. No affiliation with Kaffelogic is implied.
