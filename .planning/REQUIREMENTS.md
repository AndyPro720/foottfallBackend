# REQUIREMENTS.md — Milestone v2.0.0

> **Milestone**: v2.0.0 — PWA Stability & Advanced Property Intelligence
> **Goal**: Transform the PWA into a production-grade tool with reliable offline sync, enhanced data capture, and a robust search/filtering engine.

---

## v2.0 Requirements

### PWA & UI Stability

- [ ] **PWA-01**: App layout respects iPhone safe areas (notch, dynamic island, home indicator) without content clipping or overlap
- [ ] **PWA-02**: Offline reload/reopen does NOT sign the user out — auth state persists across offline sessions
- [ ] **PWA-03**: Offline mode loads cached data instantly (<100ms) without hanging or showing blank screens
- [ ] **PWA-04**: Connectivity banner renders correctly (fixed position, visible styling, smooth enter/exit transitions)
- [ ] **PWA-05**: Only the "Property Name" field is mandatory; all other fields are optional
- [ ] **PWA-06**: All form sections default to collapsed on the Register Property page (except Property Information)
- [ ] **PWA-07**: UI receives a visual polish pass (spacing, color consistency, typography, card design) for a premium look

### Enhanced Data Capture

- [ ] **DATA-01**: User can set Property Status as Occupied, Available, or Under Construction
- [ ] **DATA-02**: If Under Construction, user can enter estimated completion time
- [ ] **DATA-03**: If Under Construction, user can enter Part OC (number) and Complete OC (number) values
- [ ] **DATA-04**: If OC File Available = Yes, user can upload the OC document
- [ ] **DATA-05**: User can toggle Mezzanine (yes/no); if yes, enter mezzanine size (sqft)
- [ ] **DATA-06**: Clear Height shows 3 sub-fields when mezzanine=yes (Total Height, Under Mezzanine, Above Mezzanine); shows only Total Height when mezzanine=no
- [ ] **DATA-07**: Carpet Area field appears in the Property Information section (not Unit Specifications)
- [ ] **DATA-08**: Outside Space toggle with conditional photo upload when yes
- [ ] **DATA-09**: Entry to Building photo field in Property Information section
- [ ] **DATA-10**: Rent is auto-calculated as `Price per sqft × Size (sqft)` and displayed in detail view
- [ ] **DATA-11**: Unit Specifications fields are reordered: Price per sqft → Size → Mezzanine → Clear Height → CAM → Connected Load → Age of Building

### Multimedia & Location

- [ ] **MEDIA-01**: Property detail page shows an Instagram-style swipeable slider at the top with Building Facade first, then Interior photos
- [ ] **MEDIA-02**: User can upload videos (in addition to photos) across all media fields
- [ ] **MEDIA-03**: Video previews display correctly in the form (thumbnail) and detail view (playable)
- [ ] **MEDIA-04**: Google Maps widget below the location field allows user to place a pin; coordinates are stored
- [ ] **MEDIA-05**: Property detail page shows a static map with the saved pin location

### Search & Filtering (Mobile)

- [ ] **SEARCH-01**: Home page has a search bar that filters properties by name, location, and trade area (live/instant)
- [ ] **SEARCH-02**: User can filter properties by building type, property status, and price range using filter chips/controls
- [ ] **SEARCH-03**: User can sort properties by price, size, and date added

### Search & Filtering (Desktop Dashboard)

- [ ] **DASH-01**: Desktop-optimized dashboard page with responsive grid layout for property cards
- [ ] **DASH-02**: Sidebar or top-bar filter panel with multi-field filtering (type, status, location, price range, size range)
- [ ] **DASH-03**: Keyword search across all text fields (name, location, trade area, suitableFor)
- [ ] **DASH-04**: User can toggle between multiple view modes (card grid, table/list view) on the desktop dashboard

---

## Future Requirements (deferred beyond v2.0)

- Property analytics and reporting dashboard
- CRM integration
- Push notifications for sync status
- Multi-language support

## Out of Scope

- **React/Vue migration** — Staying vanilla JS (explicit decision)
- **Real-time collaborative editing** — Not needed for this use case
- **Offline photo upload queue** — Photos still require connectivity (existing design)

---

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| PWA-01 | — | Pending |
| PWA-02 | — | Pending |
| PWA-03 | — | Pending |
| PWA-04 | — | Pending |
| PWA-05 | — | Pending |
| PWA-06 | — | Pending |
| PWA-07 | — | Pending |
| DATA-01 | — | Pending |
| DATA-02 | — | Pending |
| DATA-03 | — | Pending |
| DATA-04 | — | Pending |
| DATA-05 | — | Pending |
| DATA-06 | — | Pending |
| DATA-07 | — | Pending |
| DATA-08 | — | Pending |
| DATA-09 | — | Pending |
| DATA-10 | — | Pending |
| DATA-11 | — | Pending |
| MEDIA-01 | — | Pending |
| MEDIA-02 | — | Pending |
| MEDIA-03 | — | Pending |
| MEDIA-04 | — | Pending |
| MEDIA-05 | — | Pending |
| SEARCH-01 | — | Pending |
| SEARCH-02 | — | Pending |
| SEARCH-03 | — | Pending |
| DASH-01 | — | Pending |
| DASH-02 | — | Pending |
| DASH-03 | — | Pending |
