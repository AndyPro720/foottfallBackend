# Features Research — v2.0.0

## Existing Features (already built)
- Property CRUD with Firebase backend
- Offline-first with cache-then-network pattern
- Google Auth + role-based access (admin/agent)
- Photo upload (multi-category: facade, interior, signage, floor plan)
- Collapsible form sections with toggle fields
- User management with approval workflow

---

## Feature Categories

### Category 1: PWA & UI Polish

| Feature | Type | Complexity | Notes |
|---------|------|-----------|-------|
| Fix iPhone status bar overlap | Table Stakes | LOW | CSS env(safe-area-inset-*) |
| Fix offline mode reliability | Table Stakes | MEDIUM | Service worker caching strategy review |
| Only "Name" mandatory | Table Stakes | LOW | Remove `required` from all fields except `name` |
| Premium UI redesign polish | Table Stakes | MEDIUM | Color palette, spacing, typography refinement |
| Default all sections collapsed except first | Table Stakes | LOW | Config change in propertyFields.js |

### Category 2: Enhanced Data Capture

| Feature | Type | Complexity | Notes |
|---------|------|-----------|-------|
| Effective Rent calculation (auto) | Table Stakes | LOW | `price * (size + cam)` — display in detail view |
| Entry to Building photo | Table Stakes | LOW | New file field in Property Info section |
| Property Status (Occupied/Available/Near Completion) | Table Stakes | MEDIUM | Select field + conditional sub-fields |
| Near Completion → time estimate | Table Stakes | LOW | Conditional text field |
| OC Status (Part OC / Complete OC) | Differentiator | MEDIUM | Conditional numeric fields + file upload |
| Mezzanine (yes/no + size) | Table Stakes | LOW | Toggle + conditional number field |
| Carpet Area field | Table Stakes | LOW | Number field moved to Property Info |
| Clear Height (3 options: total/under/above mezzanine) | Differentiator | MEDIUM | Conditional rendering based on mezzanine toggle |
| Outside Space (yes/no + photo) | Table Stakes | LOW | Toggle + conditional file upload |
| Unit Spec reorder | Table Stakes | LOW | Reorder fields in config |

### Category 3: Multimedia & Location

| Feature | Type | Complexity | Notes |
|---------|------|-----------|-------|
| Instagram-style photo slider on detail page | Differentiator | MEDIUM | Swiper.js — facade then interior on top |
| Video upload support across all photo fields | Table Stakes | MEDIUM | Already partially supported; needs UI polish |
| Front facade + interior as hero slider | Differentiator | LOW | Pull from existing photo categories |
| Google Maps pin for location | Differentiator | HIGH | Google Maps JS API + geocoding + pin placement |

### Category 4: Search & Filtering

| Feature | Type | Complexity | Notes |
|---------|------|-----------|-------|
| Mobile-friendly search bar | Table Stakes | MEDIUM | Client-side text search across properties |
| Filter by building type, status, location | Table Stakes | MEDIUM | Firestore queries + UI filter chips |
| Sort by price, size, date | Table Stakes | LOW | Client-side sorting |
| Desktop dashboard page | Differentiator | HIGH | New page with grid layout, advanced filters, keyword search |
| Future: property analytics dashboard | Anti-feature (v2) | — | Defer to v3.0 |

---

## Feature Dependencies

```
PWA Polish ←── (no deps, do first)
  │
  ├── Enhanced Data Capture ←── (depends on PWA stability)
  │     │
  │     └── Multimedia & Location ←── (depends on new fields being in place)
  │
  └── Search & Filtering ←── (depends on data fields being finalized)
```

## Anti-Features (explicitly excluded)

- **Push notifications**: Not needed for internal inventory tool
- **Real-time collaborative editing**: Overkill for this use case
- **Property analytics/reporting**: Deferred to v3.0
- **CRM integration**: Deferred (noted in PROJECT.md vision)
- **Multi-language support**: Not needed for Indian market internal tool
