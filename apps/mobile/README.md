# Mobile

Flutter frontend for Android and iOS, with an optional browser preview. See the repository root README for run commands and docs/environment.md for native setup steps.

Sign in with phone now connects to the actual backend. After a roster phone number and local test code are verified, the app shows the imported directory, search and filters, full profiles, and My profile. Saving your own profile updates PostgreSQL. Mobile session credentials use platform secure storage; logout revokes the server session.

Explore interface preview remains a separate fictional-data demonstration. It never grants access to real members.

See docs/authentication.md for setup and local test-code retrieval. No SMS is sent yet, and local test accounts are not marked phone-verified. Real SMS delivery, account recovery, and photo upload remain pending.

Android emulator uses http://10.0.2.2:3000; iOS simulator uses http://127.0.0.1:3000. Release builds require an HTTPS API_BASE_URL. Native secure storage requires a full rebuild/relaunch after installation, not just hot restart.

Run flutter tests through the project wrapper. The integration_test/app_flow_test.dart entry point exercises the frontend on an Android emulator with synthetic HTTP responses; backend auth:check independently exercises the real APIs in an isolated database.

Last Android verification (2026-10-01): seven emulator tests passed across the initial and focused runs, covering the preview, phone sign-in, authenticated directory and own-profile loading, district selection, logout, contact destinations, and membership request. These mobile tests use synthetic HTTP responses and mock secure storage; the backend authentication checks use a disposable database. No real participant was claimed or edited by these tests. Flutter analysis also passed. The new iOS sign-in flow has not yet been verified.

From the repository root, run the mobile flow checks with:

    ./scripts/flutter.sh test integration_test/app_flow_test.dart -d YOUR_EMULATOR_ID

After integration testing, restore the regular app with:

    ./scripts/flutter.sh run -d YOUR_EMULATOR_ID

Existing roster members now sign in directly; new people use Request membership and wait for administrator approval. District is available alongside the existing directory filters. Profile contacts have Call, WhatsApp and Copy actions; unrecognizable free text remains copyable without guessing a destination. The private login number is not used for another member's contact buttons.

Contact actions use the official Flutter [url_launcher plugin](https://pub.dev/packages/url_launcher) and WhatsApp [click-to-chat links](https://faq.whatsapp.com/5913398998672934). The phone/WhatsApp app must be available; unsupported devices show a copy fallback. No message or call is sent automatically.
