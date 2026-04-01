# Phase 7 Research: PWA Stability & UI Polish

## Bug Analysis

### BUG-1: iPhone Safe Area Overflow
**Root Cause**: `.top-bar` has `padding: 0 var(--space-md)` but NO `padding-top: env(safe-area-inset-top)`. The `body` only has `padding-top: 56px` (top-bar height), not accounting for iPhone status bar.
**Fix**: Add `padding-top: env(safe-area-inset-top)` to `.top-bar`, increase body `padding-top` to `calc(56px + env(safe-area-inset-top, 0px))`.

### BUG-2: Offline Reload Signs User Out  
**Root Cause**: `syncUserProfile()` at `userRoleService.js:12` calls `getDoc(userDocRef)` — this is a SERVER-FIRST call. When offline on page reload, `onAuthStateChanged` fires with a restored user, then `syncUserProfile` is called which does `getDoc()`. If server is unreachable, this either throws or hangs. The error isn't caught at the `main.js:319` call site (`syncUserProfile(user).catch(...)` catches but doesn't prevent the flow from breaking).

The REAL issue: `syncUserProfile` tries to call `setDoc` for `lastLogin` update (line 28). When offline, `setDoc` queues locally but `getDoc` can fail. On page reload, auth is restored from IndexedDB but the profile sync failure path doesn't gracefully handle it — the user's profile state becomes null/undefined which triggers redirect to login.

**Fix**: Make `syncUserProfile` cache-first too. Try `getDocFromCache` before `getDoc`. For `lastLogin` update, use non-blocking pattern.

### BUG-3: Connectivity Banner Duplicate CSS
**Root Cause**: `.connectivity-banner` is defined TWICE in style.css:
- Lines 942-972: Floated below top-bar, translucent, centered
- Lines 1039-1068: Slides from top=-60px, full-width, solid red

The second declaration overrides the first. The `top: -60px` + `transform: translateY(60px)` on `.visible` means the banner slides to `top: 0px` — but the top-bar is at that exact position, so the banner is hidden BEHIND or overlapping the top-bar.

**Fix**: Remove the duplicate, keep one clean implementation. Position it below the top-bar accounting for safe areas.

### BUG-4: Too Many Mandatory Fields
**Root Cause**: `propertyFields.js` has `required: true` on: `name`, `buildingType`, `location`, `contactName`, `contactInfo`, `size`, `price` (7 fields). User wants ONLY `name`.

**Fix**: Remove `required: true` from all fields except `name` in `propertyFields.js`.

### BUG-5: Sections Not Collapsed by Default
**Root Cause**: `propertyFields.js` only has `collapsed: true` on Contact, Specs, Facilities, and Photos. Property Information (`collapsed: false`) is intentionally open. This is correct per user intent. But the user also mentioned registration sections should default collapsed — verify all non-property-info sections have `collapsed: true`.

**Status**: Already correct — Property Info is `collapsed: false`, all others are `collapsed: true`. No change needed.

## UI Polish Analysis

### Current Issues:
1. **Color monotony**: Deep green everywhere (bg-base → bg-surface → bg-raised are all shades of the same green). Lacks visual hierarchy contrast.
2. **Card design**: Cards have minimal visual depth. Single border style for all states.
3. **Typography**: Display size cuts sharply at 480px breakpoint (32px→24px). Could be smoother.
4. **Empty states**: Generic SVG icons. Could have more personality.
5. **Form UX**: File upload zones are minimal (dashed border only). Could have more visual affordance on mobile.

### Polish Recommendations:
1. Add subtle gradient overlays to cards for depth
2. Increase thumbnail size on property cards (56px→72px)
3. Add subtle hover glow effect on interactive elements
4. Improve badge variants with more distinctive colors
5. Add loading state transitions (skeleton→content should feel smooth)
6. Consider warm accent for warnings/pending states

## Files to Modify

| File | Changes | Impact |
|------|---------|--------|
| `src/style.css` | Safe area padding, banner fix, UI polish | Visual |
| `src/config/propertyFields.js` | Remove `required: true` from non-name fields | Data |
| `src/backend/userRoleService.js` | Cache-first `syncUserProfile` | Critical offline fix |
| `src/main.js` | Safe area body padding | Layout |
| `index.html` | Verify viewport meta (already correct) | — |
| `src/components/ConnectivityBanner.js` | Verify logic (already correct) | — |
