# Research Synthesis — v2.0.0

## Stack Additions
- **Swiper.js v11+** — Instagram-style media slider (~20KB gzipped)
- **@googlemaps/js-api-loader v1.16+** — Interactive pin placement for locations
- **No framework changes** — Staying vanilla JS + Vite + Firebase

## Feature Table Stakes
| Priority | Feature | Complexity |
|----------|---------|-----------|
| 1 | iPhone safe area fix | LOW |
| 2 | Offline mode reliability | MEDIUM |
| 3 | Remove mandatory fields (keep only Name) | LOW |
| 4 | Effective Rent auto-calculation | LOW |
| 5 | Property Status tracking | MEDIUM |
| 6 | Mezzanine + Clear Height logic | MEDIUM |
| 7 | Video upload across all fields | MEDIUM |
| 8 | Instagram photo slider | MEDIUM |
| 9 | Mobile search & filtering | MEDIUM |

## Watch Out For
1. **iOS Safe Areas**: Must test on real iPhone — simulator doesn't accurately reproduce notch/dynamic island behavior.
2. **Offline Firestore persistence**: Silent failures in Safari Private Mode. Need graceful degradation.
3. **Clear Height conditional logic**: Current `propertyFields.js` doesn't support cross-field conditionals (mezzanine toggle → clear height options). Needs new rendering pattern.
4. **Effective Rent formula ambiguity**: Confirm `pricePerSqft * (totalArea + cam)` vs `pricePerSqft * totalArea + cam`.
5. **Video file sizes**: Set 50MB cap on mobile to prevent upload timeouts.
6. **Google Maps API key**: Must restrict to specific domains in Cloud Console.
7. **Form complexity**: 12+ new fields — mitigate with collapsed sections + progressive disclosure.

## Recommended Build Order
1. **Phase: PWA & UI Polish** — Foundation fixes before features
2. **Phase: Enhanced Data Fields** — Schema and form changes
3. **Phase: Multimedia & Location** — Slider, video, maps
4. **Phase: Mobile Search & Filtering** — Stable data model required first
5. **Phase: Desktop Dashboard** — Largest scope, depends on all above

## Key Architecture Decisions
- **Computed fields stored in Firestore**: `effectiveRent` calculated on save, not on read. Enables filtering/sorting.
- **Client-side search for mobile**: No new Firestore indexes needed. Filter the already-fetched array.
- **Dynamic imports for heavy libraries**: Swiper and Google Maps loaded on-demand, not precached.
- **Backward-compatible schema**: All new fields optional. Existing documents remain valid.
