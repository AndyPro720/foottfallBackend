# Architecture Notes

Critical implementation details that agents MUST consult when modifying data schemas.

---

## ⚠️ Field Schema — Triple Sync Requirement

When adding, renaming, or removing a field from Firestore inventory documents, **three files must be updated in lockstep**:

| File | Purpose | Failure Mode |
|------|---------|-------------|
| `firestore.rules` → `inventoryAllowedKeys()` | Server-side schema enforcement | `Missing or insufficient permissions` error |
| `src/backend/inventoryValidator.js` → `INVENTORY_ALLOWED_KEYS` | Client-side pre-flight validation | Same error (validator rejects before write) |
| `src/config/propertyFields.js` → `SECTIONS` | UI form field definitions | Field not shown in forms |

### Also update if applicable:
- `inventoryValidator.js` → `OPTIONAL_STRING_FIELDS` (string length limits)
- `inventoryValidator.js` → `NUMBERISH_FIELDS` (numeric range validation)
- `inventoryValidator.js` → `BOOL_LIKE_FIELDS` / `STRICT_BOOL_FIELDS` (type checks)
- `inventoryValidator.js` → `URL_FIELDS` (URL format validation)

### Projects Collection
For the `projects` collection, the equivalent sync points are:
- `firestore.rules` → `projectsAllowedKeys()`
- `src/backend/projectService.js` (no separate validator yet)
- `src/config/propertyFields.js` → `PROJECT_SECTIONS`

### Why this matters
Firestore security rules return only generic "permission denied" errors with zero detail about which field or rule failed. The `inventoryValidator.js` exists specifically to catch these failures client-side and surface actionable error messages. **Skipping it means silent write failures in production.**

---

## Key Data Collections

| Collection | Service File | Config |
|-----------|-------------|--------|
| `inventory` | `src/backend/inventoryService.js` | `propertyFields.js → SECTIONS` |
| `projects` | `src/backend/projectService.js` | `propertyFields.js → PROJECT_SECTIONS` |
| `users` | `src/backend/userRoleService.js` | N/A |

---

*Last updated: 2026-05-05*
