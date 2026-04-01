# Stack Research — v2.0.0 Additions

## Existing Validated Stack (DO NOT re-research)
- **Frontend**: Vanilla JS + Vite 6.4 (SPA with hash routing)
- **Backend**: Firebase (Firestore, Auth, Storage, Cloud Functions)
- **PWA**: vite-plugin-pwa 1.2 (Workbox-based service worker)
- **Styling**: Vanilla CSS design system (custom properties)
- **Fonts**: Inter from Google Fonts

## New Stack Additions Needed

### 1. Google Maps JavaScript API (Location Pin)
- **Package**: `@googlemaps/js-api-loader` v1.16+
- **Why**: User requested Google Maps pin integration below the location field. The JS API Loader provides a clean async way to load the Maps SDK without cluttering the HTML `<head>`.
- **Integration**: Load on-demand when the IntakeForm location section is rendered. Store lat/lng in Firestore alongside the text address.
- **Cost note**: Google Maps Platform offers $200/month free credit (~28k map loads). For an internal tool this is more than sufficient.
- **Alternative considered**: Static Maps embed (simpler, but no interactive pin placement).

### 2. Swiper.js (Instagram-style Media Slider)
- **Package**: `swiper` v11+ (tree-shakeable, ESM native)
- **Why**: User wants Instagram-style facade/interior sliders on the detail page. Swiper is the de facto standard: touch-optimized, no jQuery, excellent PWA compatibility.
- **Integration**: Import only the modules needed (Navigation, Pagination, Lazy Loading). ~20KB gzipped for core + modules.
- **Alternative considered**: Pure CSS scroll-snap (lighter, but lacks pagination dots and lazy loading).

### 3. Video Handling
- **No new dependencies needed.** Firebase Storage already supports video upload. The existing `storageService.js` uses `uploadBytesResumable` which handles large files well.
- **Changes needed**: 
  - Accept `video/*` in file inputs (already partially done in some fields).
  - Generate video thumbnails client-side using `<canvas>` + `video.currentTime` (no library needed).
  - Consider file size limits (Firebase Storage supports up to 5GB per file; set a practical limit of 100MB for mobile uploads).

### 4. iOS PWA Safe Area Handling
- **No new dependencies.** Fix requires CSS `env(safe-area-inset-*)` values and proper `viewport-fit=cover` (already set in index.html).
- **Changes**: Apply `padding-top: env(safe-area-inset-top)` to `.top-bar`, and `padding-bottom: env(safe-area-inset-bottom)` to `.bottom-nav`.

### 5. Search & Filtering
- **No new client-side libraries for Phase A (mobile search)**. Firestore compound queries + client-side filtering for the limited dataset.
- **Phase B (Desktop dashboard)**: May consider `Fuse.js` v7+ (~4KB gzipped) for fuzzy client-side search if Firestore query limitations become a bottleneck.
- **Firestore Composite Indexes**: Will need to create composite indexes for multi-field filtering (status + buildingType, location + price range, etc.).

### 6. Effective Rent Calculation
- **No new dependencies.** Pure JS: `effectiveRent = pricePerSqft * (totalArea + cam)`. Computed field, stored in Firestore for query efficiency.

## What NOT to Add
- **React/Vue/Angular**: The app is intentionally vanilla JS. Adding a framework now would be a rewrite, not an enhancement.
- **TailwindCSS**: User has a working CSS design system. Switching mid-project adds complexity for no gain.
- **Firebase Realtime Database**: Firestore is the correct choice for this data model.
- **Third-party map providers** (Mapbox, Leaflet): Google Maps is the standard in India for commercial real estate.

## Version Matrix

| Package | Current | Target | Breaking Changes |
|---------|---------|--------|-----------------|
| firebase | ^12.11.0 | ^12.11.0 | None (stay current) |
| vite | ^6.4.1 | ^6.4.1 | None |
| vite-plugin-pwa | ^1.2.0 | ^1.2.0 | None |
| swiper | — | ^11.0.0 | New addition |
| @googlemaps/js-api-loader | — | ^1.16.0 | New addition |
