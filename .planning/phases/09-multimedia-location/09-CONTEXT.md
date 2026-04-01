# Phase 09: Multimedia & Location - Context

**Gathered:** 2026-04-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Implementing image/video media sliders, video upload capabilities, and Google Maps pin placement. Includes fixing HEIC image rendering and adding PDF support to the detail view.

</domain>

<decisions>
## Implementation Decisions

### Video Handling
- **D-01:** **Strict size limit** — Enforce a 50MB limit per video to protect user data and storage costs.
- **D-02:** **Direct Upload** — No client-side compression for now; rely on native formats.
- **D-03:** **Interaction** — Videos open in a fullscreen lightbox with playback controls, consistent with the existing photo behavior.

### Maps & Location
- **D-04:** **Starting Position** — The pin placement widget will start at the user's **current GPS location** for on-site convenience.
- **D-05:** **Standard Style** — Use a standard roadmap style for the map pin and static thumbnail.
- **D-06:** **Alternative Providers** — If Google Maps API is too complex/costly, **Leaflet + OpenStreetMap** is approved as a simpler alternative.

### Slider & Gallery
- **D-07:** **Manual Swipe** — The "Instagram-style" slider will use manual swiping only (no auto-play) for a natural browsing feel.
- **D-08:** **Order** — Building Facade always appears first, followed by Interior photos.

### Additional Media Support (New)
- **D-09:** **PDF Support** — PDFs (like OC documents) should be viewable. They don't need to be in the swipeable slider, but must have a "View Document" link in the detail view.
- **D-10:** **HEIC Fix** — Fix the existing bug where HEIC images (common on iPhones) do not render correctly in the PWA.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Documentation
- `.planning/PROJECT.md` — Core vision for v2.0.0
- `.planning/REQUIREMENTS.md` — MEDIA-01 to MEDIA-05 requirements

### Codebase Patterns
- `src/backend/storageService.js` — Existing upload patterns
- `src/pages/PropertyDetail.js` — Existing gallery and lightbox logic
- `src/pages/IntakeForm.js` — Existing file upload input logic

</canonical_refs>

<deferred>
## Deferred Ideas
- **Client-side video compression** — Punted to future version if storage becomes an issue.
- **Algorithmic media sorting** — Stick to category-based sorting for now (Facade first).
</deferred>
