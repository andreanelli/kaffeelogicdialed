# Nano 7 USB-C Connect integration notes

User confirmed **USB-C Connect** on 11 September 2026. No physical device was available during initial development.

## Primary sources consulted

- [Kaffelogic Connect manual](https://webservices.kaffelogic.com/downloads/manuals/connect%20manual%20insert.pdf): USB-C data cable; Studio receives a completed log while connected; profiles can be saved through Studio or its computer-side roaster sync folder. The internal-memory generation differs from the older removable-stick machine.
- [Current Studio product page](https://www.kaffelogic.com/pages/studio): target/actual roast curves, rate of rise, power, profile temperature/fan editing and import/export workflows define the product surface to investigate.
- [Kaffelogic help: Storage full](https://kaffelogic.atlassian.net/wiki/spaces/RWK/pages/44367893/Storage+full): Studio exposes log storage through its connection view and Tools → Open roaster sync folders. This supports a folder-bridge strategy but does not establish filesystem watcher behavior or delivery guarantees.
- [Kaffelogic help: Extract profile from log](https://kaffelogic.atlassian.net/wiki/spaces/RWK/pages/14090253/Extract+profile+from+log): extraction can retain the starting profile and transfer roast-specific event data. Our initial app does not implement this native extraction.
- [Older Nano 7 manual](https://webservices.kaffelogic.com/downloads/manuals/Kaffelogic%20Inst%20Booklet.pdf): removable-stick models use a FAT/FAT32 workflow and sequential log filenames. This is context only, not the connection model for the user's USB-C unit.

No public USB command specification was found in the sources reviewed. That is an investigation result, not proof that no specification exists elsewhere.

## Implemented contract

| Adapter       | Operations                                           | What success means                                                           |
| ------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------- |
| Simulator     | connect, disconnect, sync revision, inventory/status | Profile revision and checksum stored in local simulator tables               |
| Studio folder | bounded scan/import, stage native original           | Archived bytes saved locally, or exact original copied to an explicit outbox |
| Direct USB-C  | not implemented                                      | No hardware claims                                                           |

Folder paths are configured on the backend using environment variables, not arbitrary paths supplied by an untrusted webpage. Import skips symlinks, does not delete or modify source files, and deduplicates bytes. Outbox staging uses `wx` exclusive creation, performs a flush and checksum read-back, and refuses all existing filenames. Treat the outbox as staging, not confirmed delivery.

The simulator has no live temperature stream, physical roast control, firmware updater, or hardware timings. It models only connection state and profile synchronization. Original `.kpro`/`.kpro2` files remain opaque; neither their safety nor their compatibility is certified by archiving/staging.

## Before implementing USB transport

1. Record exact model, board/firmware, Studio version, OS, and cable.
2. Inspect USB descriptors without transmitting speculative commands.
3. Determine whether Studio uses serial, HID, bulk USB, another service, or a vendor SDK.
4. Establish licensing and documented access for any reused protocol implementation.
5. Record log download, profile list, profile write, acknowledgement, and error behavior.
6. Confirm sync folder discovery, naming, deletion semantics and file-completion boundaries.
7. Define cancellation, retry and conflict behavior before implementing writes.

## Hardware acceptance checklist (pending)

- Discovery and reconnection identify the correct device across app restarts.
- Read-only inventory and logs match Studio's contents.
- Export a known original, download it again, compare original/returned bytes or verified canonical semantics.
- Detect filename collisions without silent replacement.
- Disconnect mid-transfer, reconnect, and recover without data loss.
- Reject unsupported firmware/protocol versions explicitly.
- Do not write while the device reports a state that forbids writing.
- Distinguish staged, sent, acknowledged, and read-back verified.
- Measure connection time and transfer latency only after correctness is established.

Until these pass, Studio remains necessary for using the actual roaster.
