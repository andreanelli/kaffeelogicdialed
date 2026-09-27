# Brew and tasting capture

Implemented 18 September 2026. Local SQLite and the existing authenticated cloud API use the same routes and validation. Storage is additive in the existing JSON entity tables, so no destructive migration is required. This change is not deployed to the hosted app.

## Record a complete case

1. **Equipment → Add equipment:** name the physical brewer and grinder. Record brand/model, burrs/axle configuration and calibration/zero point. A changed configuration should be a new entry.
2. **Brew log → Record a brew:** select the actual roast or recorded device run; enter preparation method, timestamp, equipment, grind, filter/basket, measured dose, water input, beverage yield and temperature/timing conditions. Add water chemistry, pressure, TDS, storage and preparation steps when known.
3. **Taste this brew:** record each taster separately. Flavour descriptors, liking and target match are distinct fields. The personal 0–100 and 0–10 scores remain available and optional; they are not SCA-certified scores. Blank values are null, not zero or suggested ratings.
4. Inspect the linked brew from the **Cupping table**. Multiple assessments can refer to one preparation; make a new brew record for each new extraction.

Brew input water includes bypass. Final beverage yield is a separate measurement; the app does not infer it from water input. Temperature has a location field and duration has a timer-origin field. Hardness and alkalinity use mg/L as CaCO₃. Beverage TDS is a percentage. Grinder settings stay as device-specific text; there is no conversion to microns or other grinders.

Rest hours derive from the recorded roast and brew timestamps. Unknown roast dates give unknown rest. Each brew preserves snapshots of equipment and the roast as it was recorded, including the roast timestamp. Snapshots are not retroactively rewritten after late log imports.

## Plan the nine-batch pilot

In **Experiments → Plan nine-batch pilot**, select three different real coffee lots. Supply the target/acceptance rule, preparation method, batch size within your verified device/profile limits, fixed rest time and controlled recipe/equipment conditions. In the plan text, specify the exact reference profile/revision and alternative for each lot.

The plan creates nine **unperformed trial slots**: reference, alternative and repeated reference for each lot. It creates no roast, brew or tasting observations and consumes no inventory. It does not automatically operate the roaster.

Expand the experiment's pilot section and choose **Log trial roast**. The lot, experiment, trial and planned charge size are preselected. Enter the actual revision, level, weights and timing; these measurements are not guessed. A slot cannot be assigned twice or to a different lot. A saved trial offers **Record brew**, then its preparation can be tasted from Brew log.

Hold brew conditions and rest fixed, randomize serving order outside the app, and use blind sample labels during serving. The app retains those labels but is not a blinded-tasting interface: roast identity remains visible. Record departures from the plan in notes. Progress counts logged batches, brews and linked assessments; it does not infer success from completion. Summarize findings in the experiment conclusion.

## History, compatibility and corrections

- Existing tastings are preserved byte-for-byte in storage; without a brew link, the UI shows **Brew conditions unknown**. Historical imports retain their original score semantics. No recipes or protocol compliance are invented.
- The tasting API remains compatible with old clients: a missing `brewId` means unknown preparation. New assessments use `dialed-personal-v1` to identify the personal rubric.
- Equipment and brew entries have create/read/delete workflows. They are immutable through the API; corrections require removing dependent assessments and the incorrect entry, then recording a corrected case. Export a backup before deleting valuable history. General revision/edit workflows remain future work.
- Deletion blocks equipment used by a brew, a brew used by a tasting, lots used by pilot plans, and roasts with dependent preparations or tastings. Sample cleanup and import rollback also respect these links.
- Coffee identity, profile revision and roast timestamp cannot change on a roast with attached brews. Other roast corrections keep the original `roastSnapshot` in each brew.
- If a recorded run is later linked/imported as a notebook roast, brew and tasting links move together. Existing rest/equipment snapshots stay as originally captured.
- All new entities are included in the existing workspace JSON export and cloud workspace isolation. A workspace JSON restore/import remains unimplemented.

## API

- `POST /api/equipment`: named equipment configuration.
- `POST /api/brews`: one preparation; server computes rest and captures snapshots.
- `POST /api/cuppings`: optional `brewId`, nullable personal scores, `descriptors`, `blindCode`, `liking` and `targetMatch` (1–5).
- `POST /api/experiments/pilot`: three-lot plan with nine trial slots.
- Existing roast routes accept optional `pilotTrialId`, validated against the experiment and coffee lot.
- `/api/state` includes `equipment` and `brews`; `/api/backup` includes full records and snapshots.

This is the capture layer for learning. Automated recommendation, randomized allocation, protocol-deviation scoring, relational lot metadata and model training are not implemented here.

## Verification

The automated suite covers local and cloud creation, unknown values, chronology, water accounting, equipment categories and snapshots, multiple tasters, cross-roast rejection, deletion dependencies, pilot lot/slot validation and atomic stock behaviour, plus late-log relinking with reused device-run IDs.

Browser checks used a separate temporary database: created equipment and a brew, saved a linked tasting with blank scores, created the nine-slot pilot, and verified the trial roast form preselects the correct lot/experiment/slot. No real notebook data or physical roast results were created during verification.

Final checks: 52 repository tests passed; production TypeScript/Vite build passed; targeted formatting and diff whitespace checks passed. Browser verification also confirmed that new roast measurements start blank. The temporary preview server was stopped after verification.
