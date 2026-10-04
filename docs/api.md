# Local member APIs

These read endpoints use NestJS, Prisma, and the imported PostgreSQL roster. Flutter uses them after member login. A separate interface-preview route still uses fictional data.

## Access

The server binds to 127.0.0.1. Member bearer sessions now grant directory access; see docs/authentication.md for obtaining a session and using GET/PATCH /me. The following alternative is only for server-side developer checks, and cannot access /me. It requires all three:

- NODE_ENV is exactly development.
- LOCAL_API_TOKEN is a randomly generated 64-character lowercase hex value, supplied as Authorization: Bearer <token>.
- The actual socket peer is loopback. Forwarded headers cannot bypass this check.

The token has no default. Missing configuration or any other environment returns 503; absent or incorrect credentials return 401. Responses carry Cache-Control: no-store. This temporary developer access is not a member session and must never be included in Flutter or used in production.

For routine verification, there is no need to create a persistent credential:

    ./scripts/backend.sh build
    ./scripts/backend.sh api:check

The second command starts its own ephemeral local server with a random process-only token, checks real database-backed requests without printing member values, and closes the server. It does not modify .env or member records.

For manual server requests, generate a 32-byte random hex token using Node's crypto.randomBytes(32).toString('hex'), store it only in the ignored backend .env with NODE_ENV=development, and use a local API client. Keep the token out of Git, URLs, logs, and mobile builds.

## Routes

| Method and path | Response |
| --- | --- |
| GET /members | items, total, page, pageSize, totalPages |
| GET /members/filters | sections, cadres (id/name), bcsBatches (including null), bloodGroups, homeDistricts |
| GET /members/:id | Full profile for an active member identified by internal UUID |

GET /members accepts:

| Parameter | Behavior |
| --- | --- |
| q | Case-insensitive whole-word match in the member's name only. Maximum 150 characters. |
| section | Exact section, up to two characters |
| cadreId | Exact cadre UUID |
| bcsBatch | Positive integer, or unknown for NULL |
| bloodGroup | Exact stored free text; no formatting conversion |
| homeDistrict | One of the 64 Bangladesh districts (exact English label) |
| page | Positive integer, default 1, maximum 100000 |
| pageSize | Positive integer, default 25, maximum 100 |

Filters combine with AND. Results include only active members and are ordered by unique FTC ID. Unknown parameters, repeated parameters, invalid UUIDs and malformed values return 400. A missing or inactive member returns 404. An empty result is an empty items array with total 0.

Directory summaries contain id, ftcId, name, section, cadre, bcsBatch, and homeDistrict. Details add education, university, phone, email, bloodGroup, aboutMe, and favouriteQuotation. Raw contact and blood-group text are returned unchanged. BCS batch remains numeric or null; the mobile client formats ordinal labels. Profile storage keys, verification state, and internal timestamps are not exposed.

## Privacy and deletion

`GET /privacy` and `GET /account-deletion` are public HTML pages. The deletion page verifies the user's login phone through the existing OTP endpoints. `DELETE /me` requires a valid member or staff/test session and JSON `{ "confirm": "DELETE" }`. It removes that account and its app profile in a transaction. See [privacy-and-deletion.md](privacy-and-deletion.md) for retention and restore rules.

## Pending integration

Direct roster-phone enrollment with local test codes or configured sms.bd delivery, session expiry/revocation, member-session directory access, and PATCH /me are implemented. Flutter uses these sessions rather than the developer credential. One real-phone SMS login and returning login have succeeded locally; broader carrier/device testing, account recovery, and photo storage remain pending. POST /auth/registration records pending membership requests but grants no access; administrators can approve or reject requests in the app. There is no endpoint to edit other members.

Implementation references: [NestJS guards](https://docs.nestjs.com/guards) and [Prisma reading data](https://www.prisma.io/docs/orm/fundamentals/reading-data).
