---
title: "Phase 8 Research: Enhanced Data Capture"
slug: 08-research
---

# Research: Enhanced Data Capture

## Context
The goal is to significantly expand the `IntakeForm.js` and `PropertyDetail.js` modules to support conditional fields (like "Under Construction" status revealing timestamps, "Mezzanine" revealing 3 clear height sub-fields) and new logic calculations (Effective Rent).

## Current Codebase Architecture
1. **`propertyFields.js` configuration**:
   - `renderToggle` currently handles `hasCount` and `hasPhoto` cleanly.
   - However, conditional subsets like "Near Completion -> Time", "Mezzanine -> Size + Clear Height splits" are more complex than the generic `hasCount`. We will need a generic `conditionalFields` array in the field config or specific data-condition targets.
   - `status` is currently rendered directly inside `PropertyDetail.js` as an inline hardcoded dropdown (`Active/Pending/Inactive`) and handled dynamically upon submission in `IntakeForm.js`. The requirement states Status should be captured dynamically (Occupied, Available, Near Completion).

2. **`IntakeForm.js`**:
   - Needs listeners attached to 'select' elements (for Status) and 'toggle' elements (for Mezzanine) to toggle visibility of their respective conditional field groupings.
   - Form submission explicitly builds the data object. We must ensure that conditional fields (like the 3 clear heights) are saved selectively according to the main toggle's state.

3. **`PropertyDetail.js`**:
   - Rent is auto-calculated as `Price per sqft × Size (sqft)`. The existing template formats `price` directly; we should format a derived `rent` value when both fields are present.

## Approach
- **Property Status**: Add `status` field manually to `propertyFields.js`'s Property Info section as a `select` (options: Occupied, Available, Under Construction) so it's captured at intake.
- **Conditional Rendering Upgrade**: In `IntakeForm.js`, expand the toggle logic to evaluate generic `data-condition="fieldname=value"` selectors if needed, or explicitly link specific IDs for Mezzanine and Status options.
- **Photos & Docs**: Add `entryToBuilding` photo field. Expand `outsideSpace` to use `hasPhoto`. Add `ocFile` as `type: 'file'` instead of toggle.
- **Calculations**: Implement Rent calculation purely in `PropertyDetail.js` as a read-side computed variable to keep Firestore clean (avoids recalculation syncing on price updates).
