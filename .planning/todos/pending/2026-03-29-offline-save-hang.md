---
title: Offline Save UI Hang
type: bug
status: pending
created: 2026-03-29
phase: 05-offline-auth
---

# Offline Save UI Hang

During Phase 5 UAT (Test 6), we discovered that while the Firestore `setDoc` operation correctly queues the property data in the offline cache, the `IntakeForm` UI button gets stuck in the "Loading..." state indefinitely while completely offline.

This prevents the form from automatically redirecting to the dashboard as intended (though the user can manually navigate away and the data *is* saved).

## Technical Context
The `withTimeout` wrapper in `inventoryService.js` was modified to fire `setDoc(docRef)` without awaiting it if `navigator.onLine` is false. However, the UI still hangs on submission. This indicates the form's submission handler is waiting on a promise that isn't resolving, possibly related to dynamically imported modules (`showToast`), the `navigator.onLine` check itself acting up in Chrome DevTools offline mode vs true network drop, or a downstream effect of Firebase's local cache initialization block. 

## To Be Fixed
1. Investigate the exact promise chain in `IntakeForm.js` offline submit.
2. Ensure `btn.classList.remove('btn-loading')` and the redirect executes synchronously when offline.
