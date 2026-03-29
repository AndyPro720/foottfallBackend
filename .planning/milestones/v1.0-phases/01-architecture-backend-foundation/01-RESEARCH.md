---
phase: 1
level: 2
researched_at: 2026-03-23
---

# Phase 1 Research

## Questions Investigated
1. What database architecture optimally supports simple inventory intake while still allowing for future CRM extensibility?
2. What API/Backend layer best pairs with a fluid, mobile-first PWA, supporting future auth and offline-capabilities without maintenance overhead?
3. How should this new stack sit relative to the existing vanilla SPA built on Vite + static CSV generation?

## Findings

### Database & Backend Selection
The existing main application uses build-time parsing of CSV files into static JSON. While extremely fast for read-only map rendering, it cannot support data mutability or offline-syncing.
We need a backend that reduces boilerplate, acts fast for a MVP, provides out-of-the-box offline PWA capabilities, and has no server-hibernation issues on free tiers.

**Firebase (Firestore + Auth + Storage)** emerges as the strongest candidate over alternatives like Supabase/PostgreSQL for this specific context, because:
1. **Native PWA Support**: Firestore's client SDK has best-in-class, battle-tested offline caching and synchronization semantics built-in.
2. **Zero Hibernation**: Unlike Supabase's free tier which pauses projects after a week of inactivity, Firebase remains always-on, which is critical for an on-the-go utility app.
3. **NoSQL Agility**: For a primarily "less query" use-case (simple inventory intake and reads), Firestore's document model is highly flexible, allowing rapid prototyping without strict schema migrations.

### Integration with Existing App
The current Vite application generates data during the build step.
**Recommendation:** Keep the new backend strictly decoupled. The PWA will read/write directly to Firebase. If the main Vite app needs inventory data in the future, it can securely fetch it client-side on load via the Firebase SDK, or pull from Firestore during static builds.

## Decisions Made
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Backend Platform | Firebase | Eliminates cold-starts/hibernation, natively powers offline PWAs, and handles unstructured inventory easily. |
| DB Technology | Firestore (NoSQL) | Flexible document architecture is perfect for varying retail unit data. |
| Integration | Decoupled | The current frontend will remain static/CSV-driven for now; the PWA will be the primary interactive client for the new backend. |

## Patterns to Follow
- Document-Oriented Design: Structure Firestore collections around core entities (`inventory`, `users`) with sub-collections for future CRM history/logs if needed.
- Decoupled Clients: Allow the PWA to act completely independently from the map dashboard.

## Anti-Patterns to Avoid
- Storing primary editable inventory inside the legacy CSVs or JSON files.
- Over-engineering real-time sync between the static map dashboard and the new backend on day one.

## Dependencies Identified
| Package | Version | Purpose |
|---------|---------|---------|
| firebase | Latest | Official Firebase SDK for Auth, Firestore, and Storage (for images). |

## Risks
- **Risk**: Eventual migration to highly complex relational CRM queries could be harder in NoSQL.
  **Mitigation**: Structure the NoSQL data cleanly. If the CRM becomes massively complex in the distant future, Firestore data can easily be streamed to BigQuery or a SQL warehouse.

## Ready for Planning
- [x] Questions answered
- [x] Approach selected
- [x] Dependencies identified
