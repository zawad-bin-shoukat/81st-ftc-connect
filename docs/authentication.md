# Claiming and phone login

The app now connects to the real roster after authentication. The Explore interface preview button still opens explicitly fictional data.

Local test codes do not establish possession of a phone: accounts record verification_method=local and verified_at=NULL. Local OTPs and sessions require NODE_ENV=development, OTP_MODE=local, and AUTH_OTP_SECRET; they are disabled in production. The sms.bd delivery mode has been configured in the private local environment and passed one real-phone login and returning-login test; more devices and mobile networks still need testing. Prisma connections explicitly use UTC so persisted OTP/session timestamps are correct regardless of the database default timezone.

To enable sms.bd, first create a provider account owned by the client, confirm that the private club's OTP message is allowed, and obtain an API key. Set OTP_MODE=sms and SMS_BD_API_KEY in the ignored apps/backend/.env; retain the existing AUTH_OTP_SECRET. Restart the backend. Never place the API key in Flutter, Git, or chat. The backend sends only to eligible members, uses HTTPS POST, and expects a successful provider request ID. A provider rejection invalidates the challenge and logs a generic error; the public response stays the same as for an unknown phone. Test delivery and timing on consenting phones across all four Bangladesh operators before inviting members. The app shows an SMS-specific instruction when this mode is active. The code expires in five minutes; a successful provider API response alone does not prove handset delivery.

Switching from local to SMS mode invalidates local test codes and denies local sessions. A local account becomes SMS-verified only after its phone completes an SMS challenge; existing sessions are revoked during that upgrade. The raw profile contact is marked verified only when it matches the verified login phone; editing that contact clears its verification timestamp without changing the login identity. A fresh session is then issued. Switching back to local mode denies SMS sessions.

## Existing members: phone and OTP only

Unclaimed roster members enter the phone number already in their profile. The backend derives a canonical number without editing the raw contact, requires exactly one matching roster entry (including inactive entries when checking ambiguity), and sends a code only for an active, unclaimed match. Verification rechecks eligibility and atomically creates one Account. An already-linked account continues using its existing login number; editing the profile contact does not change login identity.

Supported display forms are Bangladesh 01…, 8801…, +8801…, Bengali digits, spaces, parentheses and hyphens; international numbers require an explicit +country code. Missing digits, annotations and multiple numbers are not guessed. A read-only audit on 2026-10-01 found 539 unambiguous contacts and 14 unusable entries among 553 members, with no normalized duplicates. Existing accounts may already cover some of those exceptions. An administrator must resolve exceptions privately.

Start PostgreSQL and the backend, then run Flutter:

    ./scripts/db.sh start
    ./scripts/backend.sh start:dev
    ./scripts/flutter.sh run -d YOUR_EMULATOR_ID

In local mode, choose Sign in with phone, enter your roster number (or an already-linked login number), then retrieve the code on your Mac:

    ./scripts/backend.sh auth:code

In SMS mode, read the code on that phone instead. Enter it within five minutes. No invitation is needed for a normal roster login. The old private-invite CLI and /auth/claim route remain for administrator-assisted exceptions; they are no longer in the normal mobile flow.

## New people: administrator review

The Not in the roster? Request membership form sends name, FTC ID, phone and membership details to POST /auth/registration. It records a pending request only: no roster entry, account, session or login code is granted. Responses do not reveal existing or pending membership, and submissions are rate-limited. Phone possession is checked at first login after approval using the configured OTP mode; real SMS must be tested before launch.

The administrator can review requests in Flutter under My profile → Review membership requests. Review access is available to the separately provisioned administrator/test identity, or to existing active participants explicitly configured in ADMIN_FTC_IDS. Ordinary members cannot grant this authority through a profile edit or request body. Test ID 1000 belongs to the separate identity: it is not a participant FTC ID and does not add a placeholder to the roster.

Leave ADMIN_FTC_IDS empty when only the separate administrator/test identity should have access. To appoint a real participant deliberately, set ADMIN_FTC_IDS to that participant’s ID in the ignored backend .env and restart the backend. Multiple IDs may be separated by commas. An empty or malformed value disables review access. Authorization is rechecked on every request; removing an ID or deactivating its member revokes review access. Production uses SMS-verified accounts. Development with OTP_MODE=local permits local test accounts so synthetic review tests need no SMS.

The review screen lists pending, approved and rejected requests with pagination and refresh. Open a pending request, verify membership independently, choose an existing cadre, enter all required profile details, and record how membership was verified. Leave BCS batch blank for unknown. Approval requires an explicit verification checkbox and confirmation; rejection requires a reason. Decisions record the reviewer, time and note. Historical decisions cannot be changed by these endpoints. Failed validation and ID/phone conflicts leave the request pending and never overwrite a participant. After approval, the person must still complete phone OTP; no account or session is created by approval, and no notification is sent automatically. Tell the applicant the outcome privately. A rejected applicant can submit a fresh request with corrected information.

The local CLI remains available for trusted development review. Older and CLI decisions may have no member reviewer; they are identified as local-tool decisions. Review membership evidence independently before approving; the applicant's statement alone is not proof.

    ./scripts/backend.sh registration:review -- list

Prepare an ignored .local/new-member-profile.json with verified details:

```json
{
  "section": "A",
  "cadreId": "EXISTING-CADRE-UUID",
  "education": "Verified education",
  "university": "Verified university",
  "email": "member@example.com",
  "bloodGroup": "As provided",
  "homeDistrict": "Verified district",
  "bcsBatch": null
}
```

Name, FTC ID and login contact come from the reviewed request. The cadre must already exist. Approval validates required profile data and conflicts, creates a new roster member, and marks the request approved in one transaction. It never overwrites an existing participant. Since scripts run in apps/backend, use an absolute path to the JSON file:

    ./scripts/backend.sh registration:review -- approve REQUEST_UUID /absolute/path/to/new-member-profile.json
    ./scripts/backend.sh registration:review -- reject REQUEST_UUID

The approved person then signs in with their submitted phone and OTP. Automatic approval notifications are not implemented.

## API

| Route | Body / purpose |
| --- | --- |
| POST /auth/claim | ftcId, inviteCode, phone; begin first-time claiming |
| POST /auth/login | phone; first-time roster login or returning login |
| POST /auth/registration | name, ftcId, phone, evidence; request administrator review only |
| POST /auth/verify | challengeId, code; consume the code and return a bearer session |
| POST /auth/logout | Authenticated; revoke this session |
| GET /me | Authenticated own profile, login number, and server-computed isAdministrator capability |
| PATCH /me | Authenticated own profile updates only |
| GET /admin/registrations | Administrator only; status=pending/approved/rejected and page (20 per page) |
| GET /admin/registrations/:id | Administrator only; request, review history and available cadres |
| POST /admin/registrations/:id/approve | Administrator only; profile, membershipConfirmed=true, reviewNote |
| POST /admin/registrations/:id/reject | Administrator only; reviewNote |

Claim/login responses contain challengeId, expiresAt, retryAfterSeconds, deliveryMode. They never contain the OTP. Invalid invites and unknown login numbers receive the same response structure and cannot verify. Only local mode writes codes for the private local helper.

PATCH /me allows name, education, university, phone (display contact), email, bloodGroup, homeDistrict, bcsBatch (positive integer or null), aboutMe and favouriteQuotation. It rejects account identifiers, login phone, FTC ID, section, cadre, verification fields, and activity status. Member identity always comes from the session, never a supplied profile ID. Email syntax is checked both by the API and database; phone and blood group retain free-text values.

## Expiry and concurrency

- Invitations contain 256 bits of randomness, expire after seven days, and are stored as SHA-256 hashes.
- Codes are six random digits, expire after five minutes, allow at most five verification attempts, and are stored as keyed hashes. A newer code invalidates earlier challenges for that phone.
- Database row locks serialize verification and invitation consumption; one invite cannot create two accounts.
- Database rate limits persist across server restarts: code requests are limited to 5 per phone and 30 per peer per 15-minute fixed window; resend cooldown allows one per phone per 60-second fixed window. Verification permits 60 attempts per peer per 15-minute window, with the stricter per-challenge five-attempt limit.
- Sessions contain 256 bits of randomness, expire after 30 days, and are stored as hashes. Logout revokes the current session. Inactive members cannot use existing sessions.
- Flutter uses platform secure storage for mobile bearer tokens. The optional browser preview keeps tokens only in memory. Network failures display retry states; they do not replace real data with fictional records.

## Development networking

NestJS continues to bind only to 127.0.0.1. Android emulator defaults to http://10.0.2.2:3000, iOS simulator to http://127.0.0.1:3000. Override with --dart-define=API_BASE_URL=... when appropriate. Android allows unencrypted traffic only to development loopback hosts in debug builds; release Flutter builds require an HTTPS URL. iOS allows local networking. Browser testing uses http://localhost:8080, the sole configured development CORS origin.

The optional LOCAL_API_TOKEN still permits local read-only developer checks on /members. It cannot access /me and is never included in Flutter.

## Checks

    ./scripts/backend.sh build
    ./scripts/backend.sh auth:check
    ./scripts/backend.sh api:check
    ./scripts/backend.sh db:verify
    ./scripts/flutter.sh analyze

auth:check creates a uniquely named temporary database, applies the migration history, runs synthetic authentication/profile checks, then drops that database. It never claims or edits real members. api:check checks the actual imported roster without printing participant values.

## Before real member use

Finish broader sms.bd delivery tests across operators and devices, production HTTPS configuration, account recovery and verified login-number changes, operational invite distribution, and expired-code/rate-limit cleanup. Local test accounts must be reverified through SMS; do not relabel them as SMS-verified. Photo storage/upload is still pending.

Provider references: [sms.bd API](https://sms.bd/api), [non-masking OTP service](https://sms.bd/OTP_NonMasking/), and [terms](https://sms.bd/Terms_Condition/).

References: [OWASP authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html), [Prisma transactions](https://www.prisma.io/docs/orm/fundamentals/transactions), [Flutter networking](https://docs.flutter.dev/cookbook/networking/fetch-data), [Flutter secure storage](https://pub.dev/packages/flutter_secure_storage).

## Membership review verification (2026-10-02)

The review implementation passed 108 authentication/integration checks against a disposable database, 11 Flutter widget tests, 5 backend unit tests, static analysis/lint, and the existing 37 schema checks. The integration tests cover anonymous/member denial, malformed and revoked administrator configuration, invalid profile/review data, canonical phone conflicts, concurrent approvals, immutable history, audit attribution, and OTP login after approval. A checksum comparison confirmed all 553 real participant rows were unchanged after applying the additive audit migration. UI tests use fictional API data; the separate test identity’s real-phone walkthrough must be completed by the owner. No real registration decision or approval SMS was made during testing.

## Separate administrator/test identity

Test ID 1000 has its own TestAccount, TestOtpChallenge and TestSession records. It is outside Member and Account, the roster count, district filters and participant directory. Its editable profile is explicitly fictional. Test login never assigns a session to a real participant, even when the same phone already belongs to a participant Account. Existing participant accounts remain unchanged; the normal phone sign-in route still uses those accounts.

Private backend configuration: TEST_ADMIN_ENABLED=true, TEST_ADMIN_ID=1000 and TEST_ADMIN_PHONE set to the owner’s canonical phone. Keep ADMIN_FTC_IDS empty for the separate identity alone. Provision with ./scripts/backend.sh test-account:setup after deploying migrations and building the backend. The setup command is local-only and idempotent, and refuses phone reassignment. There is no public test-account registration API. Disabling TEST_ADMIN_ENABLED, changing the configured identity, or deactivating its TestAccount immediately denies its sessions. Production requires SMS mode; local verification never counts as SMS verification.

In Flutter, sign out an existing participant session first. On the welcome screen choose Administrator / test sign-in, enter test ID 1000 and the configured phone, then enter the SMS OTP. The test profile contains Review membership requests. Its profile edits update only TestAccount.profile; approval of an actual request intentionally adds a new participant and records the test administrator as reviewer, never as a participant. Use synthetic requests for testing and do not approve invented members into the real roster.

POST /auth/test/login accepts testId and phone; POST /auth/test/verify accepts challengeId and code. Test OTPs and tokens are separate from participant OTPs and tokens. Phone/IP throttles are shared across both entry points. Tokens are stored securely and revoke on sign-out. Test sessions can read the existing directory and use /me for the separate profile. No participant’s private login identity is returned by browsing the directory.

Separate-identity validation passed 139 isolated authentication/integration checks and 13 Flutter widget tests, including shared-phone isolation, cross-route OTP rejection, replay/expiry/attempt limits, shared cooldown, SMS upgrade with a mocked provider, administrator audit attribution and sign-out. The approval conflict handler also handles PostgreSQL serialization conflicts from Prisma’s driver adapter. No real SMS is sent by these tests.
