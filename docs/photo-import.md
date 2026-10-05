# Member photo import

The organizer's original photos remain in the Desktop `Photos` folder. The local audit matched 331 of 339 supplied files to the current 553 active members. The other eight FTC IDs (224, 228, 235, 312, 815, 1003, 1004, 1045) remain held until the remaining profiles are added and checked. Prepared copies are private, ignored files under `.local/photo-prepared`.

The importer verifies each prepared image, hashes its contents, matches FTC ID and section to an active database member, and skips profiles that already have a photo. Preview prints a digest of the exact plan. Local application requires that digest and accepts at most 500 photos per run. Small batches are useful for an initial trial; after that, a larger run can save time. Each photo is linked independently, so a stopped run leaves completed links in place and the next preview reports only what remains. It writes a private receipt and stops if a member changes during upload. It does not edit names, phones, districts, or any other profile fields.

From the repository root, with the local database running, preview the plan:

```sh
./scripts/backend.sh photos:import -- ../../.local/photo-manifest.json ../../.local/photo-prepared
```

This script runs from `apps/backend`, hence the `../../.local` paths. Preview is read-only and does not access R2. Review the reported member count, ready count, already-filled profiles, held IDs, and preview digest. Do not apply if any count or ID looks wrong. Local application requires configured private R2 credentials and changes the **local** database and bucket. Never paste credentials into commands or commit the ignored manifests, prepared images, or receipts.

## Neon photo-link publishing

After local import verification and a fresh Neon backup, the production publisher can preview links without changing Neon. It compares every manifest member against both the local database and Neon by FTC ID, section, active status, and member UUID. It uses the photo key already stored locally and checks both private R2 objects for each photo. Any identity mismatch, conflicting key, missing object, or wrong object size/type blocks applying.

Set `FTC_NEON_URL` for the command from the private connection-string file; do not put the URL in shell history or paste it into chat. `DATABASE_URL` must remain the local database URL from `apps/backend/.env`.

```sh
FTC_NEON_URL="$(cat "$HOME/Library/Application Support/81st-ftc-connect-neon-backups/neon-connection-url")" \
  ./scripts/backend.sh photos:publish-neon -- ../../.local/photo-manifest.json ../../.local/photo-prepared
```

This is a read-only preview. It reports a digest for the exact Neon rows, photos, and R2 keys. Inspect all counts and require zero conflicts and zero unavailable objects. Do not apply if any count differs from the photos you expect.

Applying requires a new, readable Neon dump created within the last 24 hours, the exact digest from preview, and explicit `--apply`. The publisher performs one transaction and updates only `members.profile_photo_key`; it rolls back if a row changes or a check fails. The apply invocation is intentionally separate and should only be run after the preview and backup have been reviewed. The eight photos without approved local roster profiles remain held and are not included.

After a preview is reviewed, make a fresh backup:

```sh
"$HOME/Library/Application Support/81st-ftc-connect-neon-backups/run-neon-backup.sh"
```

Then apply with the exact digest from that preview and the exact backup filename printed by the backup command:

```sh
FTC_NEON_URL="$(cat "$HOME/Library/Application Support/81st-ftc-connect-neon-backups/neon-connection-url")" \
  ./scripts/backend.sh photos:publish-neon -- ../../.local/photo-manifest.json ../../.local/photo-prepared \
  --apply PASTE_THE_REVIEWED_PREVIEW_DIGEST \
  --backup "$HOME/Library/Application Support/81st-ftc-connect-neon-backups/neon-YYYYMMDD-HHMMSS.dump"
```

Do not run this apply command until the preview is reviewed and the backup has completed successfully.

After adding the remaining 27 profiles, rerun the photo audit and preparation from the original source, investigate the held IDs, and generate a fresh preview. A new manifest and digest are required; do not force old matches onto new records.
