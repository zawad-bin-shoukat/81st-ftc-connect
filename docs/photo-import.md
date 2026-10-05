# Member photo import

The organizer's original photos remain in the Desktop `Photos` folder. The local audit matched 331 of 339 supplied files to the current 553 active members. The other eight FTC IDs (224, 228, 235, 312, 815, 1003, 1004, 1045) remain held until the remaining profiles are added and checked. Prepared copies are private, ignored files under `.local/photo-prepared`.

The importer verifies each prepared image, hashes its contents, matches FTC ID and section to an active database member, and skips profiles that already have a photo. Preview prints a digest of the exact plan. Local application requires that digest and accepts at most 500 photos per run. Small batches are useful for an initial trial; after that, a larger run can save time. Each photo is linked independently, so a stopped run leaves completed links in place and the next preview reports only what remains. It writes a private receipt and stops if a member changes during upload. It does not edit names, phones, districts, or any other profile fields.

From the repository root, with the local database running, preview the plan:

```sh
./scripts/backend.sh photos:import -- ../../.local/photo-manifest.json ../../.local/photo-prepared
```

This script runs from `apps/backend`, hence the `../../.local` paths. Preview is read-only and does not access R2. Review the reported member count, ready count, already-filled profiles, held IDs, and preview digest. Do not apply if any count or ID looks wrong. Local application is for a later supervised dry run; it requires configured private R2 credentials and will change the **local** database and bucket. Production application is intentionally disabled pending review of the local dry run and production backup. Never paste credentials into commands or commit the ignored manifests, prepared images, or receipts.

After adding the remaining 27 profiles, rerun the photo audit and preparation from the original source, investigate the held IDs, and generate a fresh preview. A new manifest and digest are required; do not force old matches onto new records.
