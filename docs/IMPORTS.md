# Native files and historical imports

## Native workbench

Archive an original `.kpro` or `.klog`, then choose **Inspect & import**. Recognition is based on text structure and schema, not the filename extension. This codec supports UTF-8 text profile schemas 1.4/1.6 and log schemas 1.7/1.8. Other formats remain downloadable originals with diagnostics. No binary `.kpro2` decoder is claimed.

The inspector retains ordered metadata and unknown fields, all recorded events, channel headers, and offsets. Known channels include temperature, target temperature, rate of rise, heater power and fan RPM. Unknown channels are labeled with unverified units. Charts use recorded time, including cooling; Studio's channel-offset alignment convention has not been independently verified and is not applied. Journal imports trim measured samples at the supplied roast end. Profile targets are never substituted for measured temperatures.

A profile curve stores groups of six numbers: anchor time/value, incoming handle time/value, outgoing handle time/value. The renderer samples cubic segments; the export preserves the original handle representation. The native editor supports selected existing text and numeric settings, plus advanced temperature/fan handle editing. It preserves all other settings instead of flattening a native file into the simpler research-curve format.

Original bytes and SHA-256 hashes stay attached to each native revision. A no-op export returns identical bytes. Changed exports patch only selected values, retaining line endings, BOM, ordering and untouched fields. Old revisions remain immutable. **Edited exports are for Studio review; successful reopening in Studio and device behavior have not been verified.** Editor bounds are input validation, not a validation of roast safety or firmware behavior.

Importing a log requires its actual coffee lot, green and roasted weights. Reference load size in a profile is not evidence of the mass roasted. Missing dates and end events must be supplied explicitly. The original embedded profile snapshot stays attached to the roast. Historic imports do not debit present stock, including subsequent edits of those roasts.

## Sheet migration

1. Export the relevant Google Sheets tab as UTF-8 CSV. Direct sheet synchronization is not included.
2. Create the coffee lots and import/create the profile revisions to which the old history should refer.
3. Open **Import history**, upload or select the CSV, and choose comma, semicolon or tab delimiters.
4. Review suggested column mappings. Resolve each coffee/profile name to an existing lot and exact revision.
5. Select date layout, weight/time units, decimal separator and explicit UTC offset. For mixed daylight-saving periods, use ISO timestamps with offsets or separate batches. Date-only inputs mean midnight at the chosen offset.
6. Preview all rows. Fix errors or explicitly exclude rows, then refresh the preview. No notebook records are created until the reviewed batch is committed.
7. Commit. The import stores source file/hash, logical CSV row, mapping and batch provenance. Quoted multiline cells are supported; row numbers refer to CSV records, not physical text lines.

Use a stable dataset name plus source roast IDs when multiple tastings refer to one roast. Rows with the same source ID must agree on roast fields. Without IDs, normalized roast fields determine duplicates. Changed source values or later edits in Dialed require conflict resolution; imports never overwrite existing history. A tasting retains its author/date, and blank scores or attributes remain null. A repeated identical tasting is skipped.

Rollback removes only records created by its batch. Changed records and later dependent work block rollback. Original files always remain. Import commits are transactional and repeating the same commit request is idempotent. A changed preview must be reviewed again.

Limits: 10 MB per archived file, 2,000 CSV records per import, 20,000 native text lines. Required roast weights, duration and level must be supplied rather than inferred. Thousands separators are unsupported. The local workspace remains single-user; remote collaboration belongs to a later phase.

## Evidence and remaining acceptance

The codec was checked against 17 local native profiles and 19 local logs, including four incomplete logs, without modifying Studio's source files. Local originals are outside git. Synthetic regression fixtures exercise unknown fields, byte preservation, malformed rows and unsupported versions. A public log from the [Obsidian Kaffelogic project](https://github.com/flaper87/obsidian-kaffelogic-plugin) was also examined as a format reference; no third-party implementation was vendored.

Studio-open compatibility is pending because native app automation did not provide a reliable verification session. Physical Nano 7 USB-C tests are deferred until the roaster is available. The shared sheet has not been provided, so actual sheet migration remains pending while the CSV workflow is ready.
