# BPSC cadre filter normalization

Source: [Bangladesh Public Service Commission's 26 current BCS cadres](https://bpsc.gov.bd/pages/static-pages/691997b3933eb65569dde2bf). The roster owner approved this list and the ambiguous mappings on 28 October 2026.

## Scope

- The Android app reads cadre filter options from the backend. No mobile build change is needed for this change.
- The backend offers all 26 official options, including six that currently have no members.
- The one member stored as `BPATC` (FTC 440) remains in the directory with that label until the roster administrator confirms his cadre. It does not appear as a cadre filter option. Members cannot edit their own cadre in the app.
- Future membership approvals must choose one of the official 26 cadres.

## Workbook preview

The approved 553-member base roster and 26-member addition workbook contain 579 members and 32 distinct stored cadre labels. The approved mapping is implemented in `apps/backend/scripts/normalize-cadres-neon.mjs`. Expected post-change distribution:

| Cadre | Members |
| --- | ---: |
| Administration | 237 |
| Agriculture | 83 |
| Audit and Accounts | 26 |
| Cooperatives | 4 |
| Customs and Excise | 1 |
| Family Planning | 26 |
| Fisheries | 21 |
| Food | 2 |
| Foreign Affairs | 6 |
| Forest | 2 |
| Information | 15 |
| Livestock | 57 |
| Postal | 7 |
| Public Health Engineering | 10 |
| Public Works | 13 |
| Railway Engineering | 4 |
| Railway Transportation and Commercial | 2 |
| Roads and Highways | 16 |
| Taxation | 44 |
| Trade | 2 |
| Unresolved: FTC 440, stored as BPATC | 1 |

The six official cadres with zero current members are Ansar, General Education, Health, Police, Statistics, and Technical Education.

## Production sequence

1. Obtain the production Neon connection through the normal secure environment configuration. Never commit or print it.
2. Take a fresh, restorable Neon backup containing `members` and `cadres`.
3. Run `npm run cadres:normalize-neon` from `apps/backend`. Review the read-only preview and digest. The script requires exactly 579 active members, the reviewed labels, and FTC 440 as the sole BPATC member.
4. Run `npm run cadres:normalize-neon -- --apply <previewDigest> <freshBackup.dump>`. It rechecks the roster under a lock, updates in one transaction, and verifies all counts before committing.
5. Deploy the backend changes. Check the authenticated `/members/filters` response contains 26 official options and no BPATC. Spot-check IDs 309, 929, 930, 737, 908, 947, 1224, 406, and 440 in the live app.

## Applied on 28 October 2026

The production Neon preview matched the workbook, and the guarded update committed after a fresh custom-format backup was verified. A separate read-only query confirmed 579 total and active members, all 26 official cadre rows, and the expected nine FTC ID spot checks. FTC 440 remains stored as BPATC. The backend deployment and authenticated app filter check are the remaining release checks.
