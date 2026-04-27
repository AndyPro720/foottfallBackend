# Firestore Rules Analysis

Generated while responding to the Test Mode expiration warning.

## Collections and access patterns

### `users/{uid}`

Client code:
- `syncUserProfile()` reads the current user's document.
- New users create their own profile with `uid`, `email`, `displayName`, `role`, `status`, `createdAt`, and `lastLogin`.
- The bootstrap email `trancidence@gmail.com` may create the first superadmin profile.
- Admin screens query all users ordered by `createdAt desc`.
- Admins update `status` and `role`.
- A superadmin can transfer superadmin role and delete users.
- Users periodically update only their own `lastLogin`.

Security assumptions:
- `email` and `displayName` are PII, so normal users may only read their own profile.
- Admin and superadmin users can read/manage user documents because the Admin page needs a user list.
- The bootstrap email `trancidence@gmail.com` can read user docs before its own profile exists so the initial superadmin check can run.
- Non-admin self-creation must not allow arbitrary `role` or `status`.

### `invites/{lowercaseEmail}`

Client code:
- Superadmin creates invite docs by lowercased email.
- A signing-in user checks the invite doc matching `request.auth.token.email.lower()`.
- The app creates the active profile, then deletes the consumed invite.

Security assumptions:
- Only superadmin can create invites.
- The invited authenticated email can read/delete only its own invite.

### `inventory/{id}`

Client code:
- Active users create property records.
- Agents query only their own inventory via `where("createdBy", "==", uid)`.
- Admin/superadmin users query all inventory.
- The app uses optional equality filters for property fields.
- Creators and admins can update/delete records.
- Property records contain text/number/bool fields, map coordinates, an `images` map of URL lists, facility photo URLs, creator metadata, status, and upload flags.

Security assumptions:
- Inventory is internal data; every read/write requires authentication.
- Agents can read/write their own properties.
- Admin and superadmin can read/write all properties.
- `createdBy`, creator metadata, and `created_at` are immutable after creation.

## Queries that rules must allow

- `users` where `role == "superadmin"` limit 1 for bootstrap check.
- `users` order by `createdAt desc` for Admin page.
- `inventory` full collection query for admin/superadmin.
- `inventory` where `createdBy == currentUid` for agents.
- `inventory` optional equality filters on property fields.
- `inventory` where `mediaUploadPending == true` for media migration/admin workflows.

## Devil's advocate review

- Public reads/writes: denied by default catch-all and auth checks.
- Self role escalation: non-admin self-create is limited to `agent/pending`; self-updates must keep `role` and `status` unchanged.
- Admin escalation to superadmin: denied unless current user is already superadmin.
- Updating protected fields on inventory: `createdBy`, creator metadata, and `created_at` are immutable.
- Schema pollution: rules restrict allowed top-level keys for all create/update operations.
- Large strings/lists/maps: validators apply size caps to property text, URLs, images, and maps.
- Query compatibility: read rules match the app's agent/admin ownership model.

These are prototype rules based on the current client code and should be reviewed against production data before broad rollout.
