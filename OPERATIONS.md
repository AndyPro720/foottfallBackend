# Operations Notes

## Live Firebase Usage Snapshot

Use the local CLI snapshot to inspect live Firebase usage without opening the console:

```bash
npm run usage:snapshot
```

Machine-readable output:

```bash
node scripts/usageSnapshot.mjs --json
```

### What it does

- Runs locally on the operator's machine.
- Uses the existing `firebase-tools` login token from `~/.config/configstore/firebase-tools.json`.
- Calls live Google APIs directly for Firestore, Cloud Storage, and Cloud Monitoring.
- Does **not** deploy code.
- Does **not** spawn the Firebase CLI on every request.

### What it reports

- Firestore document counts for `inventory` and `projects`
- Firestore reads, writes, and deletes over the last 24 hours
- Live Cloud Storage object counts and stored bytes
- Soft-deleted Cloud Storage object counts and retained bytes
- Recent soft-deleted media groups with hard-delete times
- Storage delete request count over the last 24 hours
- Storage download bytes over the last 30 days

## Storage Delete Verification

For property/media delete checks, use the snapshot output as the source of truth:

1. Confirm the Firestore document is gone.
2. Confirm a new soft-deleted storage group appears for the property path.
3. Check the `hard delete` timestamp to know when billed retained storage should fall away.

### Important behavior

- This bucket has Cloud Storage soft delete enabled with a 7-day retention window.
- A successful delete can remove the object from the live bucket immediately while still keeping it billable until hard delete.
- Firebase console usage views can lag behind the live API state.

## Current Commands

- `npm run usage:snapshot` — human-readable live usage report
- `node scripts/usageSnapshot.mjs --json` — JSON output for automation

