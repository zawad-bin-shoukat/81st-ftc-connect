# Store release checklist — 21 October 2026

## Current project state

- The approved directory contains 579 profiles. Private R2/Neon photo links exist for 575; FTC IDs 602, 728, 1029, and 1126 have no supplied photo. Missing photos show the app's placeholder and do not block release.
- The public backend is `https://eight1st-ftc-connect.onrender.com`. Its `/privacy` and `/account-deletion` pages responded with HTTP 200 on 19 October. Release mobile builds use this HTTPS backend by default; `API_BASE_URL` can override it during a build.
- Release builds hide the development preview and test-sign-in buttons. Long-press the welcome-screen icon to reach the separate OTP-protected administrator sign-in. The welcome screen now has an explicit **Reviewer demo** button, which opens a fictional, on-device account with reusable credentials and editable demo data; it never requests the real roster or grants administrator access. A read-only Neon check found an active SMS-verified administrator record (test ID 1000); the matching Render configuration and actual sign-in still need checking.
- Version is 1.0.1+2. Android targets API 36 through Flutter. Xcode 26.6 is installed. Android and iOS use `com.ahmedapps.ftc`.
- The owner-approved icon with the exact name “81st FTC Connect” is installed in the Android and iOS icon sets. The full-resolution proposal and 512-pixel Play listing icon are in `apps/mobile/assets/release-proposals/`.
- Use the same platform-neutral public privacy policy for both listings: `https://eight1st-ftc-connect.onrender.com/privacy`. The live page does not name either store. It currently identifies sms.bd as the OTP provider; update it if that provider changes. The operator must confirm the published contact address and data practices before submission.
- Account deletion is available from **My profile → Delete my account** and from `https://eight1st-ftc-connect.onrender.com/account-deletion` after uninstalling. Give Play Console that URL in its account-deletion web-link field. A Google Form is optional, not a way around the in-app and external deletion requirements. The hosted deletion flow still needs an end-to-end check using a disposable account and funded SMS; never delete a real participant to test it.

## Before building uploadable packages

1. The confirmed Android application ID and iOS bundle ID are both `com.ahmedapps.ftc`. Verify they match the entries in Play Console and App Store Connect before the first upload. These identities cannot be casually changed after publication.
2. Prepare current, privacy-safe screenshots from release builds and final store listing copy.
3. Create and securely retain an Android upload keystore. The Android release build now requires `FTC_ANDROID_KEYSTORE`, `FTC_ANDROID_KEY_ALIAS`, `FTC_ANDROID_STORE_PASSWORD`, and `FTC_ANDROID_KEY_PASSWORD`; it never falls back to the debug key. Keep the keystore and passwords outside Git and back them up securely. Configure the Apple team, distribution certificate, and provisioning in Xcode.
4. Build a signed Android App Bundle and an iOS archive with the permanent identifiers. Inspect package IDs, version/build numbers, target SDK, icon, API URL, permissions, and signing before uploading.
5. Test the actual release builds on a physical Android phone, iPhone, and iPad: first launch after server sleep, SMS login, 180-day session restore, name search, district filter, profile and photo viewing/editing, logout, privacy links, account deletion using a disposable identity, and administrator sign-in. Confirm SMS credit and delivery on representative networks. Never use a real participant to test deletion.
6. Run Flutter tests on a working native tester. In this workspace the available x86 tester aborts before loading tests on an Apple Silicon host; `flutter analyze` passes. Run backend checks before the final upload if backend changes are made.

## Store-console work

- The account owners must complete the listings, iPhone/iPad/Android screenshots, support contact, content/age ratings, availability, and privacy forms. Use the production `/privacy` and `/account-deletion` HTTPS URLs. Declare actual roster, contact, photo, login, and diagnostic data practices accurately.
- For Play Console Data safety and App Store Connect App Privacy, review the actual fields and integrations before answering: name, contact numbers and email, FTC ID, profile photo, blood group, education/cadre/district, OTP and account records, and any logs or diagnostics. Check whether blood group must be declared as health data under each store's form; do not assume the same category names in both consoles.
- The Android app has launcher icons for its supported densities and a 512 × 512 PNG for the Play listing (`apps/mobile/assets/release-proposals/play-store-icon-512.png`). The iPhone/iPad Xcode icon catalog includes a 1024 × 1024 source. Review the final appearance in signed builds and both store previews.
- In Play Console **Sign-in details**, enter username `ftc-reviewer`, password `FTC-Review-2026`, and the exact steps in [reviewer-access.md](reviewer-access.md). The credentials unlock only local fictional data, so they are not secrets or production accounts. The demo covers directory browsing/search, profile viewing/editing, a local photo, and demo-profile deletion. Real member sign-in, SMS delivery, and administrator review remain restricted; if Google requires those specific paths, expand the isolated review environment before resubmission rather than providing real member or administrator credentials.
- The Play owner should verify whether production access is already available in their account. The owner reports that the account predates the new-personal-account 14-day closed-testing rule; confirm the account status in Play Console.
- Have Sakib Ahmed Shanto review the published privacy policy and contact details before submission. Confirm the hosted deletion flow works with the funded SMS provider.
- Monitor Render wake-up time, SMS balance, Neon/R2 availability, daily retention, and restorable backups. Move retention scheduling off GitHub's inactivity-prone scheduled workflow before relying on it long term.

Do not commit, push, deploy, alter Neon, or submit store builds until the release configuration and review pass are complete.
