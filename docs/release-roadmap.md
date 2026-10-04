# Release roadmap (4 October 2026)

This file separates implemented behavior from unfinished release work. It contains no credentials or participant data.

## Implemented and verified locally

- Member OTP sign-in, restricted directory, profile editing, sign-out, new-member review, privacy and account deletion are implemented. The production SMS path has been tried with one phone; wider delivery testing remains.
- Directory text search now matches whole words in member **names only**. `anik` matches a separate `Anik`, not `Banik`, an FTC ID, a cadre, or `Manikganj`.
- The district filter and editors use the 64 Bangladesh districts. The local migration mapped 142 imported spellings to 63 districts present among 553 members; the remaining district stays available for future profiles. A local backup was saved before the migration. Non-district member data matched before and after.
- Backend build, unit tests, live API checks, authentication/integration checks, retention checks, and schema checks pass. Flutter analysis passes. Flutter widget tests could not start in this environment because its x64 `flutter_tester` crashes before loading tests; repeat these on a working Flutter test runtime and manually check Android and iOS before release.

## Next developer tasks

1. Review and commit the district/search changes. Take a fresh Neon backup, apply the new migration to Neon, deploy the matching backend and mobile builds, then smoke-test name search, the 64 district filter, profile edits, and approval. Do not deploy the new app UI before its API/migration.
2. Integrate the remaining 27 approved members when their verified details arrive. Preserve the existing 553 and avoid re-importing deleted accounts. Implement private photo upload, change, display, and deletion with Cloudflare R2 Standard storage. All 27 profiles and member photos are required before the first store release. The private R2 bucket and scoped credentials still need to be created before live integration testing.
3. Make production operation reliable: confirm SMS delivery/credits on representative networks, monitor Render/Neon availability and free-tier limits, keep restorable backups outside the production database, and move scheduled retention away from a GitHub Actions workflow that can stop after repository inactivity.
4. Prepare release packages: choose permanent Android package ID and iOS bundle ID, replace example IDs, configure Android upload signing and iOS signing, add final icon and store imagery, set production HTTPS API URL, increment version/build number, and verify an Android App Bundle and iOS archive. The current Flutter default targets Android API 36; verify the generated bundle before upload. Decide whether iPad is supported (the current iOS target includes it).
5. Test signed release builds on physical Android and iPhone devices, including fresh install, first wake after server idle, OTP, directory, profile editing, registration review, privacy/deletion, and sign-out. Test account deletion only with a disposable account.

## User/client inputs and store-console work

- Provide verified details for the remaining 27 members and approved photos for the first release; approve final name/logo/screenshots and the app's geographic availability.
- Create a Cloudflare R2 subscription and a private Standard bucket for profile photos. Cloudflare may require a payment method even while usage stays within the free allowance. Grant the backend a token limited to that bucket and keep the token in private environment settings; never commit it. Review the public privacy policy after photo storage is integrated.
- Have Sakib Ahmed Shanto review the published privacy policy as the named operator and confirm that the store publisher identity matches it. Confirm the support contact and app review instructions.
- Set up/confirm Play Console and Apple Developer accounts. Fill out Google Play Data safety and account-deletion fields, and Apple App Privacy, content/age rating, listing text, screenshots, and contact details. Provide reviewers a working way through the OTP-gated app; a dedicated non-participant review account or acceptable demo route needs to be designed and tested.
- Arrange closed-test participants if the Play developer account is a personal account created after 13 November 2023. Google's current rule is 12 opted-in testers for 14 consecutive days before applying for production access.

## Official references checked

- Bangladesh government district list: https://bangladesh.gov.bd/views/district-list
- Google Play target API: https://support.google.com/googleplay/android-developer/answer/11926878
- Google Play new personal-account testing: https://support.google.com/googleplay/android-developer/answer/14151465
- Google Play Data safety: https://support.google.com/googleplay/android-developer/answer/10787469
- Google Play account deletion: https://support.google.com/googleplay/android-developer/answer/13327111
- Apple SDK requirement: https://developer.apple.com/news/upcoming-requirements/
- Apple app review: https://developer.apple.com/app-store/review/guidelines/
- Apple App Privacy: https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/
- Apple account deletion: https://developer.apple.com/support/offering-account-deletion-in-your-app/
- Cloudflare R2 pricing: https://developers.cloudflare.com/r2/pricing/
- Cloudflare R2 setup: https://developers.cloudflare.com/r2/get-started/
