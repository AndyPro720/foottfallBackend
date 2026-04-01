# Architecture Research — v2.0.0 Integration

## Existing Architecture

```
index.html
  └── main.js (SPA shell: auth, routing, top-bar, nav)
        ├── pages/
        │     ├── Home.js (property list)
        │     ├── IntakeForm.js (data entry)
        │     ├── EditProperty.js (edit flow)
        │     ├── PropertyDetail.js (detail view)
        │     ├── Login.js (auth)
        │     └── Admin.js (user management)
        ├── backend/
        │     ├── firebaseConfig.js (Firebase init)
        │     ├── inventoryService.js (Firestore CRUD)
        │     ├── storageService.js (file uploads)
        │     └── userRoleService.js (auth + roles)
        ├── config/
        │     └── propertyFields.js (field definitions)
        ├── components/
        │     └── ConnectivityBanner.js
        └── utils/
              └── ui.js (toasts)
```

**Key pattern**: `propertyFields.js` is the single source of truth for form fields. IntakeForm, EditProperty, and PropertyDetail all read from `SECTIONS`. Adding new fields means editing this one config file.

## Integration Points for New Features

### 1. New Data Fields → `propertyFields.js`
**What changes**: Add new field definitions to existing sections and reorder.
**Impact**: IntakeForm and EditProperty automatically render new fields. PropertyDetail needs manual updates for computed displays.

**New fields to add:**
- Property Info: `carpetArea`, `entryPhoto` (file), `outsideSpace` (toggle + photo)
- Unit Specs: `mezzanine` (toggle + size), `clearHeight` variants, reorder existing fields
- New section or field group: `propertyStatus` (select: Occupied/Available/Near Completion), `ocStatus` (conditional)

**Reordered Unit Specs:**
1. Price per sqft (existing `price`)
2. Size (existing `size`)
3. Mezzanine (NEW toggle + size)
4. Clear Height (MODIFIED — 3-option logic)
5. CAM (existing `cam`)
6. Connected Load (existing `connectedLoad`)
7. Age of Building (existing `buildingAge`)

### 2. Effective Rent Calculation
**Where**: Computed in PropertyDetail.js and Home.js card
**Formula**: `effectiveRent = price * (size + cam)` — total monthly rent estimate
**Storage**: Compute on save in IntakeForm.js, store as `effectiveRent` field in Firestore for indexing/filtering.

### 3. Instagram Slider → PropertyDetail.js
**What changes**: Replace the current `renderPhotoGallery()` function with a Swiper-based slider at the top of the detail view.
**Order**: Building Facade → Interior → other categories
**New component**: `components/MediaSlider.js`

### 4. Google Maps → IntakeForm.js + PropertyDetail.js
**What changes**: 
- IntakeForm: Add a map widget below the location text field. User taps to place a pin, coordinates stored as `location_lat` and `location_lng`.
- PropertyDetail: Embed a static map showing the pin.
**New component**: `components/LocationPicker.js`

### 5. Video Support Enhancement
**What changes**: Already partially implemented. Need to:
- Ensure all file upload zones accept `video/*`
- Add video thumbnail generation in preview
- Handle video playback in the gallery/slider

### 6. Search & Filtering

**Phase A — Mobile Search (new component)**:
- `components/SearchBar.js` — text input with live filtering
- `components/FilterChips.js` — horizontal scroll of filter options
- Modify `Home.js` to include search/filter above the property list
- Client-side filtering of the already-loaded Firestore data

**Phase B — Desktop Dashboard (new page)**:
- `pages/Dashboard.js` — responsive grid layout, sidebar filters, keyword search
- New route: `#dashboard`
- Firestore composite indexes for efficient multi-field queries

### 7. PWA Fixes

**iPhone status bar**:
- `style.css`: Add `padding-top: env(safe-area-inset-top)` to `.top-bar`
- `style.css`: Add `padding-bottom: env(safe-area-inset-bottom)` to `.bottom-nav`

**Offline reliability**:
- Review `vite.config.js` PWA config — may need explicit `workbox` runtime caching rules
- Consider `NetworkFirst` strategy for Firestore API calls instead of relying solely on Firestore SDK cache
- Add explicit precache for Google Fonts

## Data Model Changes (Firestore)

```
inventory/{docId}
  ├── name (string) ← ONLY mandatory field
  ├── buildingType (string)
  ├── floor (string)
  ├── location (string)
  ├── location_lat (number) ← NEW
  ├── location_lng (number) ← NEW
  ├── carpetArea (number) ← NEW (moved from specs)
  ├── tradeArea (string)
  ├── suitableFor (string)
  ├── entryPhoto (array<string>) ← NEW
  ├── outsideSpace (boolean) ← NEW
  ├── outsideSpacePhoto (string) ← NEW
  │
  ├── propertyStatus (string: occupied|available|near_completion) ← NEW
  ├── completionTime (string) ← NEW (conditional)
  ├── ocPartial (number) ← NEW
  ├── ocComplete (number) ← NEW
  ├── ocFile (boolean) ← EXISTING (moved context)
  ├── ocFileUpload (array<string>) ← NEW (conditional on ocFile=true)
  │
  ├── price (number)
  ├── size (number)
  ├── mezzanine (boolean) ← NEW
  ├── mezzanineSize (number) ← NEW (conditional)
  ├── clearHeightTotal (number) ← NEW (replaces clearHeight)
  ├── clearHeightUnderMezzanine (number) ← NEW (conditional)
  ├── clearHeightAboveMezzanine (number) ← NEW (conditional)
  ├── cam (number)
  ├── effectiveRent (number) ← NEW (computed)
  ├── connectedLoad (number)
  ├── buildingAge (number)
  │
  ├── images.buildingFacade (array<string>)
  ├── images.unitFacade (array<string>)
  ├── images.interior (array<string>)
  ├── images.signage (array<string>)
  ├── images.floorPlan (array<string>)
  ├── videos (map) ← NEW (parallel to images)
  │
  └── (existing metadata: createdBy, created_at, etc.)
```

## Suggested Build Order

1. **PWA & UI Polish** — Fix the foundation before adding features
2. **Enhanced Data Fields** — New fields in propertyFields.js + form logic
3. **Multimedia & Location** — Slider, video, maps (depends on fields)
4. **Mobile Search & Filtering** — Requires stable data model
5. **Desktop Dashboard** — Final phase, biggest scope
