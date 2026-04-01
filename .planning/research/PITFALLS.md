# Pitfalls Research — v2.0.0

## Critical Pitfalls (Adding Features to Existing PWA)

### 1. ⚠ iOS PWA Status Bar — The "Notch Problem"
**Risk**: HIGH
**Phase**: PWA & UI Polish

The current app uses `apple-mobile-web-app-status-bar-style: black-translucent` which allows content to render behind the notch/dynamic island. But the CSS doesn't account for safe area insets.

**Symptoms**: Content hidden behind the iPhone notch, bottom nav overlapping the home indicator.

**Prevention**:
- Apply `padding-top: env(safe-area-inset-top)` to the `.top-bar`
- Apply `padding-bottom: env(safe-area-inset-bottom)` to `.bottom-nav`
- Add `padding-left/right: env(safe-area-inset-left/right)` for landscape mode
- **Test on actual iPhone** — Safari DevTools simulate this poorly

### 2. ⚠ Firestore Offline Persistence — The "Green Screen" Regression
**Risk**: HIGH
**Phase**: PWA & UI Polish

The existing 1.5s auth timeout was added to fix the green screen, but offline mode is still "unreliable." Root causes:
- Firestore's `enableIndexedDbPersistence()` may silently fail in some browsers
- The `getDocsFromCache` call can throw if persistence isn't initialized
- Safari Private Mode doesn't support IndexedDB persistence

**Prevention**:
- Wrap all cache-first reads in try/catch (already done, but verify error paths)
- Add explicit Workbox runtime caching for Firestore REST endpoints as a fallback
- Test with Chrome DevTools → Application → Service Workers → Offline checkbox
- Add a visual indicator when operating in degraded offline mode

### 3. ⚠ Google Maps API Key Security
**Risk**: MEDIUM
**Phase**: Multimedia & Location

Embedding a Google Maps API key in client-side code exposes it. For an internal tool this is manageable, but:

**Prevention**:
- Restrict the API key to specific domains in Google Cloud Console
- Restrict to Maps JavaScript API + Geocoding API only
- Monitor usage in Cloud Console
- Consider using an environment variable (already have `.env` pattern)

### 4. ⚠ Video Upload Size & Mobile Performance
**Risk**: MEDIUM
**Phase**: Multimedia & Location

Mobile users may try to upload raw 4K videos (100MB+). Firebase Storage supports it, but:
- Upload over cellular can timeout
- Firestore document size limit is 1MB — can't store base64 video
- The preview grid will lag if trying to render multiple video thumbnails

**Prevention**:
- Set max file size (50MB for video, 10MB for images) with client-side validation
- Show upload progress bar (already partially in IntakeForm.js)
- Generate thumbnails using `<canvas>` from video frame, not by loading full video
- Consider compressing images client-side before upload (browser-image-compression library)

### 5. ⚠ Firestore Composite Index Limits
**Risk**: MEDIUM
**Phase**: Search & Filtering

Firestore requires composite indexes for multi-field queries. Each unique query pattern needs its own index.

**Prevention**:
- Keep mobile search client-side (filter already-fetched array) — no new indexes needed
- For desktop dashboard, plan indexes carefully: max 200 composite indexes per collection
- Use `firestore.indexes.json` to track and deploy indexes
- Consider denormalizing (e.g., store `city` as a separate field for direct filtering)

### 6. ⚠ Data Migration — New Fields on Existing Documents
**Risk**: LOW
**Phase**: Enhanced Data Capture

Adding new fields (mezzanine, propertyStatus, etc.) to the schema means existing documents won't have these fields.

**Prevention**:
- All new fields should be treated as optional in display code (already the pattern — `value || ''`)
- No migration script needed — Firestore is schemaless
- The detail view already handles missing fields gracefully (skips rendering)
- Computed fields (effectiveRent) should handle missing inputs: `if (!price || !size) return null`

### 7. ⚠ Service Worker Cache Bloat
**Risk**: LOW
**Phase**: PWA & UI Polish

Adding Swiper.js and Google Maps SDK increases the cached bundle size. If the SW precache grows too large, initial PWA install takes longer.

**Prevention**:
- Dynamic import Swiper and Maps (only load when needed, not in precache)
- Set Workbox `maximumFileSizeToCacheInBytes` appropriately
- Use `runtimeCaching` with `StaleWhileRevalidate` for external assets

### 8. ⚠ Form Complexity — Too Many Fields
**Risk**: MEDIUM
**Phase**: Enhanced Data Capture

Adding ~12 new fields makes the form longer. On mobile, this can feel overwhelming.

**Prevention**:
- Keep collapsed sections (already in place)
- Default ALL sections except Property Info to collapsed (user requested this)
- Add smooth scroll-to-section on header tap
- Consider a "Quick Add" mode that only shows the essentials (name + photo)
- Progressive disclosure: only show mezzanine height fields when mezzanine=yes

## Integration-Specific Pitfalls

### Clear Height Logic
The 3-option clear height (total / under mezzanine / above mezzanine) has a dependency on the mezzanine toggle. If mezzanine = No, only show "Total Height." If mezzanine = Yes, show all three.

**Pitfall**: The current `propertyFields.js` doesn't support conditional field visibility based on OTHER fields (only same-field toggle conditions). This will need a new rendering pattern.

### Effective Rent Formula
User said "multiplies the rent per sqft and the total area sqft + cam." This could mean:
- `effectiveRent = pricePerSqft * (totalArea + cam)` ← most likely interpretation
- `effectiveRent = pricePerSqft * totalArea + cam` ← mathematically different

**Action**: Confirm formula with user during requirements phase.
