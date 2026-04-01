# Phase 09: Multimedia & Location - Plan

**Phase Number:** 09
**Phase Slug:** multimedia-location
**Status:** In Progress
**Goal:** Implement Instagram-style slider, video uploads (50MB cap), Map pin placement (Leaflet), and PDF/HEIC support.

## Wave 1: Core Media & Storage
*Backend updates and library integration.*

### Task 01: Install Media Libraries
**Objective:** Add `heic-to` for iPhone image conversion.
```xml
<read_first>
- package.json
- src/backend/storageService.js
</read_first>
<action>
- Run: npm install heic-to
- Verify: package.json dependencies updated.
</action>
<acceptance_criteria>
- "heic-to" appears in package.json.
</acceptance_criteria>
```

### Task 02: Update Storage Service
**Objective:** Implement 50MB video cap and HEIC auto-conversion in the upload service.
```xml
<read_first>
- src/backend/storageService.js
</read_first>
<action>
- Modify `uploadFile` to take a `maxSize` (50MB).
- In `uploadMultipleFiles`, check for `.heic` extension and call `heicTo` before uploading.
</action>
<acceptance_criteria>
- `storageService.js` contains `heic-to` import.
- `uploadMultipleFiles` handles `.heic` conversion.
</acceptance_criteria>
```

## Wave 2: Location & Maps
*Interactive Map integration in the Intake Form.*

### Task 03: Leaflet Initialization
**Objective:** Add Leaflet CSS/JS to `index.html`.
```xml
<read_first>
- public/index.html
</read_first>
<action>
- Add Leaflet CDN links to the head of `index.html`.
</action>
<acceptance_criteria>
- `index.html` contains Leaflet CSS and JS CDN links.
</acceptance_criteria>
```

### Task 04: "Drop a Pin" Component
**Objective:** Implement the Map Pin selection in `IntakeForm.js`.
```xml
<read_first>
- src/pages/IntakeForm.js
- src/config/propertyFields.js
</read_first>
<action>
- Add a Map container below the location field.
- Add `L.map` initialization with `L.marker`.
- Capture marker coordinates into the property data object on submit.
</action>
<acceptance_criteria>
- `IntakeForm.js` has `L.map` and `marker.on('dragend', ...)` or click logic.
- Coordinates are captured in the form data.
</acceptance_criteria>
```

## Wave 3: UI/UX - Slider & Previews
*The Instagram-style gallery and premium polish.*

### Task 05: Instagram-style Slider
**Objective:** Replace the detail view gallery with a CSS-based swipeable slider.
```xml
<read_first>
- src/pages/PropertyDetail.js
- src/style.css
</read_first>
<action>
- Rewrite `renderPhotoGallery` in `PropertyDetail.js` to use `scroll-snap`.
- Group Facade photos first, then Interior.
- Add pagination dots logic.
</action>
<acceptance_criteria>
- Detail view has a slider at the top.
- Horizontal swiping feels smooth (scroll-snap).
</acceptance_criteria>
```

### Task 06: Video & PDF Integration
**Objective:** Enable video playback in slider and PDF document links.
```xml
<read_first>
- src/pages/PropertyDetail.js
</read_first>
<action>
- Update video detection logic to include more extensions.
- Add "View Document" link for fields containing PDFs (like OC documents).
</action>
<acceptance_criteria>
- Video previews render in the slider.
- PDFs have a visible "View Document" button.
</acceptance_criteria>
```

## Verification
- **UAT-01**: Upload an HEIC file -> Verify it appears as JPEG in gallery.
- **UAT-02**: Drop a Map pin -> Verify lat/lng are saved to Firestore.
- **UAT-03**: Upload a 55MB video -> Verify it is blocked at selection.
