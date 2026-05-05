# ROADMAP.md

> **Current Milestone**: v2.0.0 — PWA Stability & Advanced Property Intelligence
> **Goal**: Transform the PWA into a production-grade tool with reliable offline sync, enhanced data capture, and a robust search/filtering engine.

## Phases

### Phase 7: PWA Stability & UI Polish
**Status**: ✅ Complete
**Objective**: Fix critical PWA bugs (iPhone safe areas, offline auth persistence, connectivity banner), remove unnecessary mandatory fields, default sections to collapsed, and deliver a premium UI polish pass.


**Requirements**: PWA-01, PWA-02, PWA-03, PWA-04, PWA-05, PWA-06, PWA-07

**Success Criteria**:
1. App renders correctly on iPhone with notch/dynamic island — no content hidden behind status bar or home indicator
2. User can close the app while offline, reopen it, and remain signed in with cached data displayed
3. Connectivity banner appears/disappears smoothly with correct positioning when going offline/online
4. Only the "Property Name" field shows the required asterisk; form submits with only name filled
5. All form sections except "Property Information" are collapsed by default on the Register Property page

---

### Phase 8: Enhanced Data Capture
**Status**: ✅ Complete
**Objective**: Add new property data fields (status, mezzanine, clear height, carpet area, outside space, entry photo, OC details), implement auto-calculated Rent, and reorder Unit Specifications.


**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06, DATA-07, DATA-08, DATA-09, DATA-10, DATA-11

**Success Criteria**:
1. User can select Property Status (Occupied / Available / Near Completion) and conditional sub-fields appear correctly
2. Mezzanine toggle shows size field when "Yes"; Clear Height shows 3 sub-fields when mezzanine=yes, only Total Height when mezzanine=no
3. Carpet Area field appears in Property Information section; Unit Specs follow the prescribed order (Price → Size → Mezzanine → Height → CAM → Load → Age)
4. Rent auto-calculates as `Price per sqft × Size` and displays in the property detail view
5. Entry to Building photo and Outside Space photo upload work correctly with preview

---

### Phase 9: Multimedia & Location
**Status**: ✅ Complete
**Objective**: Add Instagram-style media slider to detail page, enable video uploads across all media fields, and integrate Google Maps pin placement for location.


**Requirements**: MEDIA-01, MEDIA-02, MEDIA-03, MEDIA-04, MEDIA-05

**Success Criteria**:
1. Property detail page shows a swipeable slider at the top with Building Facade first, then Interior photos, with pagination dots
2. User can upload videos alongside photos in any media field; videos show thumbnail preview in form and are playable in detail view
3. Below the location text field, a Google Maps widget allows the user to tap and place a pin; coordinates are stored in Firestore
4. Property detail page shows a static map thumbnail with the saved pin location

---

### Phase 10: Mobile Search & Filtering
**Status**: ✅ Complete
**Objective**: Add a mobile-friendly search bar, filter controls, and sorting to the Home page property list.



**Requirements**: SEARCH-01, SEARCH-02, SEARCH-03

**Success Criteria**:
1. Home page has a search bar that instantly filters the property list by name, location, or trade area as the user types
2. Filter chips/controls allow filtering by building type, property status, and price range
3. User can sort the property list by price (low→high, high→low), size, or date added
4. Search, filter, and sort work together (combined state) and reset gracefully

---

### Phase 10.1: Project-Based Property Grouping & Unit Management (INSERTED)

**Goal:** [Urgent work - to be planned]
**Requirements**: TBD
**Depends on:** Phase 10
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 10.1 to break down)

### Phase 11: Desktop Dashboard
**Status**: 🔲 Not Started
**Objective**: Build a desktop-optimized dashboard page with responsive grid layout, sidebar/top-bar multi-field filtering, and keyword search across all text fields.

**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04

**Success Criteria**:
1. A dedicated `#dashboard` route renders a responsive grid layout that adapts from mobile (single column) to desktop (multi-column cards)
2. Desktop view shows a sidebar or top-bar filter panel supporting multi-field filtering (type, status, location, price range, size range)
3. Keyword search matches across name, location, trade area, and suitableFor fields with highlighting of matched terms
4. User can toggle between card grid view and table/list view; preference persists across sessions
5. Dashboard loads all properties efficiently and maintains scroll position during filtering

---

## Requirement Traceability

| REQ-ID | Phase | Description |
|--------|-------|-------------|
| PWA-01 | 7 | iPhone safe area layout |
| PWA-02 | 7 | Offline auth persistence |
| PWA-03 | 7 | Instant cache loading |
| PWA-04 | 7 | Connectivity banner fix |
| PWA-05 | 7 | Only name mandatory |
| PWA-06 | 7 | Sections default collapsed |
| PWA-07 | 7 | Premium UI polish |
| DATA-01 | 8 | Property Status field |
| DATA-02 | 8 | Near Completion time |
| DATA-03 | 8 | Part OC / Complete OC |
| DATA-04 | 8 | OC file upload |
| DATA-05 | 8 | Mezzanine toggle + size |
| DATA-06 | 8 | Clear Height 3-option |
| DATA-07 | 8 | Carpet Area in Property Info |
| DATA-08 | 8 | Outside Space toggle + photo |
| DATA-09 | 8 | Entry to Building photo |
| DATA-10 | 8 | Rent auto-calculation |
| DATA-11 | 8 | Unit Spec reorder |
| MEDIA-01 | 9 | Instagram-style slider |
| MEDIA-02 | 9 | Video upload support |
| MEDIA-03 | 9 | Video preview/playback |
| MEDIA-04 | 9 | Google Maps pin placement |
| MEDIA-05 | 9 | Static map in detail view |
| SEARCH-01 | 10 | Mobile search bar |
| SEARCH-02 | 10 | Filter chips/controls |
| SEARCH-03 | 10 | Sort by price/size/date |
| DASH-01 | 11 | Desktop grid layout |
| DASH-02 | 11 | Multi-field filter panel |
| DASH-03 | 11 | Keyword search |
| DASH-04 | 11 | View mode toggle (cards/table) |
