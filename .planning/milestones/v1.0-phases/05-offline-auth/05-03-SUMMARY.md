---
phase: 05-offline-auth
plan: 03
subsystem: local
tags: [firebase, firestore, pwa, offline]
requires:
  - phase: 05-offline-auth
    provides: firestore queries
provides:
  - Offline sync persistence
  - Sync Pending UI indicators
  - Connectivity resilient queue mapping
affects: [ui]
tech-stack:
  added: []
  patterns: [navigator.onLine, pendingWrites]
key-files:
  created: [src/components/ConnectivityBanner.js]
  modified: [src/backend/firebaseConfig.js, src/pages/Home.js, src/pages/IntakeForm.js, src/backend/inventoryService.js, src/main.js]
requirements-completed: []
duration: 60min
completed: 2026-03-29
---

# Phase 5: Offline Sync & Draft UI Summary

**Integrated complete offline-first queue routing and cache fallback for offline usage.**

## Accomplishments
- Enabled `enableMultiTabIndexedDbPersistence` in `firebaseConfig`.
- Rendered persistent Connectivity Banners based on connection drops.
- Updated Home items to show "Sync Pending" badge by inspecting `metadata.hasPendingWrites`.
- Handled offline save Promise hang by resolving IDs locally in `inventoryService`.
- Changed Router dynamic imports to Static imports in `main.js` to fix chunk loading drops.

## Decisions Made
- Firebase Storage cannot upload images offline, so `IntakeForm` was rigged to skip uploads offline with a local data queue warning.

## Next Phase Readiness
Offline capabilities stabilized.
