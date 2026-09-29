# Architecture and scope

Flutter (Android and iOS) → NestJS API → Prisma → PostgreSQL.
The optional web target is a local preview aid. Mobile never connects directly to PostgreSQL.

This repository currently contains starter apps and database configuration only. No authentication, directory, search, profile editing, photo storage, imports, admin panel, member data, migrations, or application tables have been implemented. The backend's `/` route is the generated Hello World check. The mobile starter is independent of the backend for now.

## Agreed profile schema to implement next

The conversation preview is the source for this agreement. The original spreadsheet has not been imported or re-analyzed in this setup task.

| PostgreSQL field | Agreed shape |
| --- | --- |
| id | Primary key; UUID or BIGINT decision remains open |
| ftc_id | Integer, unique |
| section | VARCHAR(2) |
| name | VARCHAR(150) |
| cadre_id | Foreign key to cadres.id |
| bcs_batch | SMALLINT, e.g. 43; Flutter later displays 43rd |
| education | TEXT |
| university | VARCHAR(255) |
| phone | VARCHAR(20), unique; normalize before import |
| email | VARCHAR(255); not agreed as unique |
| blood_group | VARCHAR(3), canonical values such as B+ |
| home_district | VARCHAR(100) |
| about_me | TEXT |
| favourite_quotation | TEXT |
| profile_photo_key | VARCHAR(500), nullable; storage key, not image bytes |
| is_active | Boolean, default true |
| phone_verified_at | Timestamp, nullable |
| created_at, updated_at | Timestamps |

A small `cadres` lookup table is planned. Exact identifiers, timestamp timezone semantics, optional-field nullability, phone normalization rules, and lookup constraints should be settled before the first migration. Spreadsheet submission Timestamp is not a core profile field. Keep batch numbers numeric and normalize blood groups/cadre labels during the future import.

Later product scope: private directory for 580 approved participants; phone OTP login, view/search/filter members, edit own profile and photo. No public registration. OTP provider and photo storage remain undecided.

## Beginner workflow

1. Keep mobile and backend changes in their respective app folders.
2. Make one small change at a time, run the relevant check, then commit.
3. Add Prisma models and the first migration only in the next schema phase.
4. Keep `.env`, local databases, uploaded spreadsheets, phone numbers, and photos out of Git.
5. Use `git status`, `git diff`, then stage specific files and commit with a short description.

When API calls are added later, Android emulators normally reach the Mac via `10.0.2.2`; an iOS simulator can use `127.0.0.1`; physical phones need the Mac's LAN address. The starter backend deliberately binds to loopback. Change binding and platform development-network configuration when device integration is implemented. No such integration exists yet.
