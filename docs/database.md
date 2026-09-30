# First database step

## What now exists

- `cadres`: one entry per normalized cadre name, e.g. Administration.
- `members`: one entry per participant, linked to one cadre.
- `_prisma_migrations`: Prisma's record of migrations it has applied.

The migration history defines the tables; use `db:status` to see which migrations have been applied locally. Both application tables remain empty until the roster import.

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

Open the local address printed by Studio. Find `members` and `cadres`; both should contain zero rows. Do not enter real participant information manually yet. Press Control-C in Terminal to close Studio.

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

## Next step

Finish the read-only `All` sheet preview, retain phone and blood-group values without format normalization, and normalize only the fields with agreed rules. No spreadsheet data has been imported at this stage. Authentication and directory endpoints will follow in separate steps.
