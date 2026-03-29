---
phase: 3
level: 1
researched_at: 2026-03-23
---

# Phase 3 Research

## Questions Investigated
1. How should the new Inventory PWA be integrated into the existing architectural footprint?

## Findings

### Routing and PWA Architecture
The current project already uses `vite-plugin-pwa` (configured in `vite.config.js`) and imports `registerSW` in `main.js`. The main App is an SPA driven by a custom Vanilla JS `Router`. 

Therefore, creating a separate HTML entry point is unnecessary and would break the fluid SPA experience.
**Recommendation:** We will add a new dedicated route to the existing router: `'/inventory': InventoryApp`. This allows the new mobile-first inventory tool to live as a sibling page alongside the `/intelligence` dashboard and `/info` landing page, sharing the same fast, dark-mode CSS and global utilities.

### UI Scaffold
The app requires an interface to input the extensive list of properties defined in Phase 1 (Name, Contact, Dimensions, Pricing, Images, Facilities, etc.).
Since it needs to be fluid and mobile-compatible, the `InventoryApp` chunk will utilize a multi-step form or a long scrollable sticky-header form utilizing the existing glassmorphic CSS classes (`.glass-card`, `.btn-frosted`).

## Decisions Made
| Decision | Choice | Rationale |
|----------|--------|-----------|
| App Location | SPA Route (`/inventory`) | Reuses the existing Vite/PWA setup and CSS without needing a complex multi-page configuration. |
| UI Strategy | Vanilla JS Component | A new class `InventoryApp` in `src/pages/inventory.js` will act just like `Intelligence` and `Home`. |

## Ready for Planning
- [x] Questions answered
- [x] Approach selected
