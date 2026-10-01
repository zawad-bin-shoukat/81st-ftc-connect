# Backend

NestJS with Prisma/PostgreSQL, a transactional roster importer, and private local member read APIs. The local database now contains 553 members imported from the approved All worksheet.

From the repository root, run the checks:

    ./scripts/backend.sh build
    ./scripts/backend.sh test
    ./scripts/backend.sh test:e2e
    ./scripts/backend.sh test:roster
    ./scripts/backend.sh test:import
    ./scripts/backend.sh db:verify
    ./scripts/backend.sh api:check

The import integration checks use temporary tables; schema verification rolls back all synthetic rows. The live API check starts and closes its own server on a temporary localhost port, using a process-only credential, without logging participant values.

See docs/database.md for import behavior, docs/api.md for directory endpoints, and docs/authentication.md for roster-phone login and administrator-reviewed registration. Local test OTPs, persistent member sessions, self-profile updates, and Flutter integration are implemented. Real SMS verification, account recovery, and photo storage remain pending.

Run auth:setup once to configure local mode and auth:code to retrieve the latest active local test code. Existing roster members need no invite. The registration:review CLI lists, approves or rejects new membership requests after the administrator verifies membership. auth:check verifies the full flow in a disposable database.
