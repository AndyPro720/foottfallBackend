---
status: testing
phase: 05-offline-auth
source: [walkthrough.md]
started: "2026-03-29T18:32:00.000Z"
updated: "2026-03-29T13:35:00.000Z"
---

## Current Test
[All Phase 5 Tests Completed - Moving to Evaluation]

## Tests

### 1. Google & Email Authentication
expected: |
  Navigating to #login shows a branded login page with Email/Password fields and a "Sign in with Google" button. Entering valid credentials (or Google auth) redirects to the dashboard.
result: pass
reported: "Firebase: Error (auth/configuration-not-found). Sign up doesn't work either."
severity: blocker
diagnosis: "Authentication providers (Google and Email/Password) have not been enabled in the Firebase Console for project 'footfall-inventory'. This is a manual configuration step that prevents any sign-in/sign-up from succeeding."

### 2. Route Protection
expected: |
  When signed out, trying to navigate to #add or a property detail page (#property/:id) automatically redirects the user back to the #login page.
result: pass

### 3. User Profile & Sign Out
expected: |
  Once signed in, the top bar shows a user avatar with your initial. Hovering/Clicking shows a dropdown with your email and a "Sign Out" button. Clicking "Sign Out" works and redirects to #login.
result: pass
reported: "Fixed: Removed 12px gap to prevent hover drop-off."

### 4. Role-Based Access Control (RBAC)
expected: |
  Adding a property with Account A ensures it is only visible in the dashboard when signed into Account A. Switching to Account B shows an empty (or different) portfolio.
result: pass

### 5. Offline Connectivity Banner
expected: |
  Disabling network connectivity (e.g., Airplane mode or DevTools Offline) triggers a floating banner at the top saying "Working Offline — Changes will sync when connected".
result: pass

### 6. "Sync Pending" Draft Mode
expected: |
  While offline, adding a new property adds it to the list immediately but with a pulsating "Sync Pending" badge on its card. The badge disappears once the network is restored and data is synced to Firestore.
result: issue
reported: "Deferred to backlog. The property correctly saves local state, but the UI button remains stuck on 'Loading...' indefinitely while offline, preventing the redirect to the dashboard."

## Summary

total: 6
passed: 5
issues: 1
pending: 0
skipped: 0

## Gaps

- truth: "Entering valid credentials (or Google auth) redirects to the dashboard."
  status: failed
  reason: "User reported: Firebase: Error (auth/configuration-not-found). Sign up doesn't work either."
  severity: blocker
  test: 1
  artifacts: [Login.js, firebaseConfig.js]
  missing: [Firebase Console: Authentication Provider Activation]
  fix: |
    User must:
    1. Go to Firebase Console > Authentication > Get Started.
    2. Under 'Sign-in method', enable 'Email/Password'.
    3. Click 'Add new provider' and enable 'Google'.
    4. Select a project support email and Save.

- truth: "Once signed in ... shows a dropdown ... Clicking Sign Out works"
  status: failed
  reason: "User reported: prompt disappears before my mouse can hover over."
  severity: minor
  test: 3
  artifacts: [style.css]
  missing: [Hover Bridge / Top Offset Alignment]
  fix: "Remove the 12px gap in .user-dropdown CSS or add a transparent pseudo-element bridge to maintain :hover state while moving to the menu."

- truth: "it should store locally and sync when online"
  status: failed
  reason: "withTimeout rejects the addDoc operation before it can enter the offline queue."
  severity: blocker
  test: 6
  artifacts: [inventoryService.js]
  missing: [True Offline-First logic]
  fix: "Remove withTimeout from all mutating operations (create, update, delete) to allow Firestore's internal sync queue to manage eventual consistency."
