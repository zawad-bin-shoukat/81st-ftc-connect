# Store reviewer access

The release build has a **Reviewer demo** button on the welcome screen, below **Sign in with phone**. It opens a fictional, on-device account. No OTP, location check, server connection, or real member record is needed. Credentials are intentionally reusable and grant no access to the private roster or administrator functions.

- Username: `ftc-reviewer`
- Password: `FTC-Review-2026`

Paste this in Google Play's **Any other information required for access** field (the username and password go in their own fields):

> On the welcome screen, tap "Reviewer demo" below "Sign in with phone". Enter the reusable credentials above and tap "Open demo". Browse, search and filter the fictional directory; open a profile; switch to "My profile" to edit details, choose/remove a local demo photo, or delete the temporary demo profile. Tap "Exit" to return. No SMS is needed. Real member and administrator records are not available in this isolated demo.

The member flow requires an approved roster entry and a fresh SMS OTP. Never give a real participant's or the administrator's sign-in to store reviewers. If a store needs to test an actual server-side member flow beyond the fictional demo, build a separate isolated server-side review environment with reusable access before submitting.
