# First database step

## What now exists

- `cadres`: one entry per normalized cadre name, e.g. Administration.
- `members`: one entry per participant, linked to one cadre.
- `_prisma_migrations`: Prisma's record of migrations it has applied.

The migration history defines the tables; use `db:status` to see which migrations have been applied locally. The local database now contains 553 imported members and 31 distinct stored cadre labels. The label count includes unusual source entries retained as requested; it is not a claim that there are 31 official cadres.

## Understand the model

A UUID is the internal identity. FTC ID is the participant-facing number; it must be unique. The `phone` field stores the recorded WhatsApp contact as required, nonblank, unique text, without a phone-number format rule. A spreadsheet cell stored as a number is converted to text at import time; Excel may already have rounded its original digits. This raw field is not a verified login number; phone OTP will require a separately verified, usable number.

Name, section, FTC ID, cadre, phone, education, university, email, blood group, and home district are required. Phone and blood group accept nonblank free text, including entries that do not follow a standard format. BCS batch may be NULL when unknown; any known batch must be positive. About me, favourite quotation, photo key, and phone verification time may be NULL, meaning not provided. Missing required spreadsheet values must be resolved before import; do not invent them. Batch 43 is stored as 43; Flutter can display 43rd later.

`profile_photo_key` stores a reference, not an image file or temporary signed URL. No photo storage provider is configured yet. `phone_verified_at` remains NULL until actual verification.

`created_at` and `updated_at` are timezone-aware. Prisma maintains the update timestamp; manual SQL updates must set it themselves.

## Inspect your tables

From the project root:

```bash
./scripts/backend.sh db:status
./scripts/backend.sh db:studio
```

Open the local address printed by Studio. The imported members and their linked cadre labels are now visible. Studio exposes private contact information, so keep it local. Press Control-C in Terminal to close Studio.

## What a migration does

`prisma/schema.prisma` describes the model in Prisma. The SQL under `prisma/migrations` creates the corresponding tables, indexes, relations and checks in PostgreSQL. Commit both together. Never modify an already applied migration or use `db push` to bypass migration history.

For a future model change, in your local development database only:

```bash
./scripts/backend.sh db:migrate -- --name describe_the_change --create-only
# Review the new migration SQL before applying it.
./scripts/backend.sh db:deploy
./scripts/backend.sh db:generate
./scripts/backend.sh db:verify
./scripts/backend.sh build
```

If Prisma proposes a reset, stop and investigate; a reset erases data. No reset was needed for this initial migration.

The migrations contain SQL CHECK constraints that Prisma cannot declare directly. Preserve those checks when changing the relevant fields. `db:verify` checks defaults, uniqueness, relationships, nonblank free-text phone/blood values, and positive IDs/batches with synthetic rows and always rolls back its transaction.

## Roster import

Only the All worksheet is read. The original workbook is never written. The approved import has 560 participant submissions, 46 internal blank rows, seven repeated-submission groups, and 553 selected members.

- Keep FTC 238 instead of 738 and FTC 805 instead of 850. For the other repeated submissions, select the newest timestamp (last worksheet row breaks a timestamp tie).
- Add .com to the six approved incomplete Gmail addresses.
- Store 43MS as batch 43; N/A and 4r become NULL.
- Preserve phone and blood-group text, including Bengali digits, nonstandard formats, and whitespace. Numeric Excel cells are converted to text; any precision already lost in Excel cannot be recovered.
- Preserve other profile text and numeric-looking names as source text. Trim email and section boundaries; normalize only recognized cadre labels. Unresolved labels such as BPATC, job titles, and unapproved misspellings remain as supplied.
- Leave photo and phone verification fields NULL. Importing a contact does not verify a login identity.

From the repository root:

    ./scripts/backend.sh roster:preview -- '../../../All participants .xlsx'
    ./scripts/backend.sh roster:import -- '../../../All participants .xlsx'

Paths are resolved from apps/backend because the wrapper changes directory. The first command is read-only. The second exercises real database constraints inside a transaction and rolls back. Add --apply only to commit an import.

Importing the same records again makes no changes. A conflicting existing profile aborts the transaction instead of being overwritten. A failure rolls back every new member and cadre from that run. The reviewed counts and corrections are checked before insertion; a changed source list requires review and an updated import policy.

Private receipts in .local/roster-imports record the workbook SHA-256, selected worksheet rows, approved corrections, and import counts. They contain no contact values and are ignored by Git.

## Next step

The local read APIs are described in docs/api.md. Account, invitation, code-challenge, session, and rate-limit tables now support the local authentication flow described in docs/authentication.md. Flutter uses these member sessions and can save its owner's profile. Implement real SMS verification and production deployment requirements before real member use.

RegistrationRequest stores pending membership requests separately from Member and Account. Submitting a request grants no access. Administrator approval from the app or trusted local tool validates a complete profile and creates a new Member atomically with the approval status; it does not modify existing roster entries. Direct roster-phone login creates the Account only after successful OTP verification.

Registration review stores reviewed_by_member_id (an optional member reference for historical/CLI decisions) and review_note, alongside reviewed_at. App decisions require a note and record the authenticated reviewer. An index supports status/date queue pagination. Administrator authority is configured privately in the backend, not in participant profile fields.

Separate administrator/test identities use TestAccount, TestOtpChallenge and TestSession. They do not create Member or Account rows and do not affect participant directory counts. TestAccount.profile is a fictional editable JSON object. RegistrationRequest.reviewedByTestAccountId records a separate reviewer, mutually exclusive with reviewedByMemberId. The additive separate_test_accounts migration leaves existing participant and account records unchanged.

Home district uses one of the 64 Bangladesh districts. The `standardize_home_district` migration maps imported spelling variants to those labels and adds a database check; profile edits and new-member approval must choose from the same list. The separate fictional TestAccount profile is not a participant district record.
