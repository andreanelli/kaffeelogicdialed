# Dialed application plan

## Intent

Make home roasting repeatable without turning experimentation into administration. A shared Dialed workspace should eventually combine the operational parts of Studio with a useful research notebook. The user confirmed a Nano 7 USB-C Connect; direct hardware tests are deferred because the roaster is not available.

The durable unit of learning is a linked chain:

**Coffee lot → experiment → roast → tasting → conclusion → profile revision.**

A roast always references the exact profile revision used. Original native files remain recoverable even if parsing is incomplete or a future parser changes its interpretation.

## Current scope, delivered

| Area               | Behavior                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Journal            | Create/edit manual roast records, dates, level, weights, timing, observations, optional original file and measured curve; search and tasting filters    |
| Comparison         | Overlay two measured temperature curves on shared axes; mark first crack; calculate development percentage and weight loss                              |
| Profiles           | Create research curves with time/temperature/fan points; append immutable versions with revision notes; inspect old versions; Dialed JSON import/export |
| Experiments        | Hypothesis, independent variable, planned/active/complete state, linked roasts, conclusion                                                              |
| Cupping            | Multiple named tastings per roast, five 0–10 attributes, independent 0–100 score, freeform notes                                                        |
| Coffee             | Coffee lot, origin, process, variety, notes, available green stock; transactionally consume/restore stock when a roast is saved/edited                  |
| Archive            | Preserve bytes in SQLite, checksum deduplication, originals download, optional linking to a roast                                                       |
| Device development | Explicit simulator connection state, revision sync, checksums, idempotency, persistent audit records                                                    |
| Folder bridge      | Opt-in folder import and native-original outbox staging, exclusive writes and checksum read-back; no hardware acknowledgement                           |
| Workspace          | Local SQLite persistence, sample notebook controls, complete JSON export                                                                                |

This is a first vertical slice. Native Studio fidelity, direct connection, live roast streaming, remote collaboration, Google Sheets migration, and production hosting remain explicitly incomplete.

## Architecture

### Initial local application

```text
Browser (React / TypeScript / Vite)
              │ same-origin JSON API
Local Node service (Express / Zod)
              ├── SQLite: entities, original files, metadata
              ├── SimulatorAdapter: database-backed profile transfers
              └── StudioFolderAdapter: bounded read / exclusive outbox write
                                      │ future manual Studio handoff
                               Kaffelogic Studio → Nano 7 Connect
```

A local backend is intentional: a hosted server cannot reach a USB device on the user's laptop. A separate adapter boundary lets us develop notebook and synchronization behavior without inventing wire commands. The UI never claims simulated/staged files are installed on the roaster.

React owns interaction and display; the service owns validation, inventory accounting, identifiers, revision numbering, file bytes, and sync state. SQLite is the source of truth. Browser state is not the persistence layer.

The initial database uses a typed entity envelope (`kind`, ID, JSON document, timestamp) with indexed kinds. Cross-record constraints are enforced by the API inside transactions; SQLite foreign keys do not currently model entity relationships. This keeps the first schema flexible but is a deliberate migration debt. Before multiuser access, move core entities to relational tables, add migration history, SQL foreign keys/uniqueness constraints, optimistic locking, and an inventory movement ledger.

### Intended shared architecture

```text
React app ── authenticated API ── PostgreSQL + original-object storage
                                   │ authenticated, outbound agent channel
                           Local device companion
                                   │ verified transport adapter
                              Nano 7 Connect
```

The companion should authenticate to one workspace and device, keep an offline queue, and initiate outbound connections. Avoid exposing the local USB service to the network. Preserve original SHA-256 hashes and profile revision IDs across uploads, retries, and acknowledgements.

Browser-only USB/serial is an option to investigate after identifying the actual transport and browser requirements, not a current assumption. A desktop wrapper may be preferable for dependable offline operation, file watchers, and OS-specific device access.

## Domain model

- **Workspace / membership** (future): identity, roles, invitations, units and default timezone.
- **Coffee lot**: name, origin, producer/variety/process, stock; future purchase and harvest metadata.
- **Profile**: stable logical identity and current display metadata.
- **Profile version**: immutable point data, recommended level, revision note, optional source original; future full native settings and parser version.
- **Roast**: coffee lot, exact version, optional experiment, actual roast date, weights, level, timings, notes, measured curve, original attachment.
- **Tasting**: roast, taster, timestamp, attributes, independent overall score, notes; future brew recipe fields and blind labels.
- **Experiment**: hypothesis, controlled variable, lifecycle, conclusion; future structured variants and control groups.
- **Original file**: immutable bytes, checksum, initial filename, archive time. Duplicate content currently keeps the first filename; alias/source tracking is future work.
- **Device / transfer**: adapter identity, capabilities, connection state, transfer hashes, statuses, audit timestamps. Real-device identities and failure/retry state machines are future work.

## Product workflow

1. Register a new coffee lot once.
2. Frame an experiment and what will remain constant.
3. Choose a validated native profile or an explicitly marked research revision.
4. When hardware support is verified, preflight a transfer, preserve the device original, and wait for acknowledgement/read-back.
5. Collect the original log and the profile snapshot. Never infer an actual date solely from a sequential filename.
6. Add weights and observations. A roast without decoded measurements remains valid but has no invented curve.
7. Taste after a chosen rest period, with named authors and repeat tastings.
8. Compare roasts, write a conclusion, and create the next profile revision.

## Phased roadmap and acceptance gates

### Phase 1 — notebook foundation (implemented)

Persistent notebook, versioning, archive, simulator, temporary-folder bridge, validation tests, responsive UI. Acceptance: complete a coffee → profile → roast → tasting flow; reload without data loss; editing a profile does not affect a previous roast; duplicate file imports do not multiply bytes.

### Phase 2 — native files and existing history (implemented; compatibility acceptance pending)

Implementation status: native inspection, selective revisions, CSV mapping/preview/commit and protected rollback are implemented. The local corpus contains 17 profiles and 19 logs; four logs have incomplete metadata. Original copies are archived locally, outside git. Studio-open compatibility and the real sheet migration remain pending. See `IMPORTS.md` and `VERIFICATION.md`.

Reference collection covers exports from the user's Studio installation: profiles, logs from different firmware versions, and a CSV export of the current sheet. Treat these as user data and keep them out of git. Record Studio/firmware versions and source hashes.

Implement format detection and lossless parsing in dedicated codec modules. Preserve unknown fields, native ordering/encoding where necessary, and original bytes. Parse temperature, target temperature, fan, rate of rise, power, first crack and other events only when the channel semantics/units are verified. Produce clear diagnostics for unsupported versions.

Profile editing must cover the settings actually used by the user before replacing Studio. Edited native files are available for Studio review only. Treat generated-native output as roaster-ready only after byte/semantic round-trip fixtures and Studio-open compatibility tests pass. Do not rename Dialed JSON to `.kpro`.

Build a Google Sheets/CSV import wizard: map columns, preview dates and units, resolve lots/profiles, deduplicate, display errors, then commit a batch with provenance and rollback. The importer now provides this workflow through CSV exports; direct Google Sheets access remains future work.

Acceptance: reference native files decode accurately; unsupported inputs remain intact; exported profiles reopen in Studio; imported tasting rows retain authors/dates; no silent unit or date coercion.

### Phase 3 — USB-C Connect discovery and protocol adapter (investigation first)

Identify OS USB descriptors, class, driver, and supported vendor interface. Seek a documented SDK/protocol or study legally accessible specifications and user-owned diagnostic traces. Capture exact Studio sync-folder behavior, filenames, acknowledgement semantics, and race conditions. Do not guess serial baud rates or send arbitrary commands.

Implement a real adapter with capability negotiation: discovery, connect/disconnect, inventory, read log/profile, transfer native profile, status verification, reconnect recovery. Separate statuses: queued → transferring → awaiting verification → verified / failed / conflict. “Saved locally” and “installed on device” are different outcomes.

Use an exclusive per-device write lock, preserve overwritten originals with immutable hashes, and explicitly resolve filename/content conflicts. Add a durable retry queue and injected disconnect tests. Firmware updates and live roast actuation are outside the initial device adapter.

Acceptance without hardware: fixture/recording-based protocol tests and simulated faults pass. Acceptance with hardware: transfers round-trip unchanged, interruption does not lose originals, duplicates are idempotent, final device inventory matches acknowledged state. This gate cannot be signed off until the Nano 7 is present.

### Phase 4 — shared Dialed workspace

Add PostgreSQL relational schema, object storage, authenticated sessions, membership roles, per-workspace authorization, audit authorship, and version/ETag conflict checks. Add user-owned export and tested restore. Deploy behind HTTPS; ensure only the local companion can access device operations. Keep the existing local workspace importable.

Acceptance: two users can add notes concurrently without overwriting each other; authorization tests prevent cross-workspace access; backups restore records and original hashes; roaster remains usable through temporary network loss.

### Phase 5 — complete research workbench

Structured brew recipes, rest-time comparisons, taste evolution, roast overlays with channels and event alignment, profile fan graph, revision diffs, batch inventory ledger, explicit experiment variants, and optionally live telemetry after protocol verification. Add undo/archive for user records and user-facing import/backup recovery.

Prioritize based on actual roasting sessions instead of copying every Studio menu. Native-compatible profile management and dependable historical evidence remain the core objective.

## Risks and choices

- **Unknown device protocol:** real blocker to a genuine Studio replacement; architecture isolates it but does not solve it by simulation.
- **Native semantics:** wrong times, temperatures or settings can create misleading profiles. Unknown data must be preserved and labeled, not approximated silently.
- **Local concurrency:** the initial app is one trusted local workspace with no auth, no conflict detection, and last-write-wins edits. Add concurrency control before sharing.
- **Shared inventory:** present stock is directly editable and manually logged roasts consume stock. A future movement ledger is needed for purchases, corrections and accountable multiuser use.
- **Backups:** stop-and-copy database backups are restorable; JSON currently supports export only. Add tested import/restore before replacing all existing storage.
- **Scope:** first-release measurements and curves are deliberately smaller than Studio's full channel/settings model. This is visible in product copy and documented here.

## Testing strategy

Use API integration tests for cross-entity invariants, SQLite restart tests for persistence, native golden fixtures for future codecs, adapter contract tests plus fault injection, and UI workflows across desktop/mobile. Hardware verification is a separate signed checklist with actual model, firmware, OS, cable and results. Never equate simulator success with hardware compatibility.
