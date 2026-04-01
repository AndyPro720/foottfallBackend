# Phase 09: Multimedia & Location - Research

**Date:** 2026-04-01
**Status:** Complete
**Phase Goal:** Implement media sliders, video uploads, map pin placement, HEIC fix, and PDF support.

## Standard Stack

- **HEIC Conversion**: `heic-to` (Modern, faster than heic2any, supports recent iOS formats).
- **Maps**: **Leaflet.js** + **OpenStreetMap** tiles (Free, lightweight, excellent offline support).
  - *Alternative*: Google Maps JavaScript API (Free up to $200/mo, better search/satellite, but restricted offline).
- **Media Slider**: **CSS Scroll Snap** (Native swipe feel) + **IntersectionObserver** (Pagination dots).
- **Video Previews**: Native `<video>` element with `blob:` URLs for previews.

## Architecture Patterns

### 1. HEIC-to-JPEG Pipeline
- Intercept files in the `IntakeForm.js` change handler.
- If `file.type === 'image/heic'` or extension is `.heic`:
  - Run `heicTo({ blob: file, type: "image/jpeg" })`.
  - Replace the original HEIC file in the upload queue with the converted JPEG.
- **Note**: Use a Web Worker if conversion takes >200ms to avoid UI freeze.

### 2. "Drop a Pin" Map Workflow
- Load Leaflet via CDN or local vendor script.
- Initialize map at `navigator.geolocation.getCurrentPosition()`.
- Listener on `map.on('click', ...)` to move a single marker and update the `lat/lng` hidden fields.
- For detail view: Use a static Map tile URL or a read-only Leaflet instance.

### 3. Instagram-style Slider
- Container: `overflow-x: auto`, `scroll-snap-type: x mandatory`.
- Items: `scroll-snap-align: start`, `flex: 0 0 100%`.
- Logic: `IntersectionObserver` updates the active dot index.

## Don't Hand-Roll

- **Map Pan/Zoom**: Use Leaflet's built-in interactions.
- **HEIC Decoding**: Use `heic-to`.
- **Swipe Events**: Use CSS Scroll Snap instead of custom `touchstart/touchmove` listeners.

## Common Pitfalls

- **Memory Leak (iOS)**: `URL.createObjectURL` must be revoked when the preview is removed.
- **Large Videos**: 50MB check should happen *immediately* on file selection, not during upload, to provide instant feedback.
- **Map Z-Index**: Leaflet controls often clash with fixed headers/sticky buttons. Ensure `z-index` hierarchy is defined.

## Code Examples

### HEIC Conversion logic
```javascript
import { heicTo } from 'heic-to';

async function handleFileSelect(file) {
  if (file.name.toLowerCase().endsWith('.heic')) {
    const jpegBlob = await heicTo({ blob: file, type: 'image/jpeg' });
    return new File([jpegBlob], file.name.replace(/\.heic$/i, '.jpg'), { type: 'image/jpeg' });
  }
  return file;
}
```

### Leaflet Pin Drop
```javascript
const map = L.map('map').setView([lat, lng], 15);
let marker = L.marker([lat, lng], { draggable: true }).addTo(map);

map.on('click', (e) => {
  marker.setLatLng(e.latlng);
  updateCoords(e.latlng.lat, e.latlng.lng);
});
```
