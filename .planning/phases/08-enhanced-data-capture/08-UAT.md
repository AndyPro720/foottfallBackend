# Phase 8: Enhanced Data Capture — Verification (UAT)

## Status Tracking & Info Move
- [x] **Test 1**: Open Register Property form. Verify "Carpet Area (sq ft)" is in the first section (Property Information).
- [x] **Test 2**: Select **Under Construction** from "Property Status". Verify "Completion Time", "Part OC", and "Complete OC" fields appear.
- [x] **Test 3**: Select **Available** or **Occupied**. Verify those 3 fields disappear.

## Mezzanine & Clear Height
- [x] **Test 4**: Go to "Unit Specifications". Toggle **Mezzanine Available** to "Yes".
- [x] **Test 5**: Verify "Mezzanine Size", "Clear Height Under Mezzanine", and "Clear Height Above Mezzanine" fields appear.
- [x] **Test 6**: Toggle **Mezzanine Available** to "No". Verify those fields disappear, leaving only "Total Clear Height".

## Calculations
- [x] **Test 7**: Enter "Carpet Area" (e.g. 1000) and "Price per Sq Ft" (e.g. 150). Submit the property.
- [x] **Test 8**: Open the property details. Verify **Effective Rent** shows "₹1,50,000 / month". (Fix applied: changed `const fieldsHtml` to `let`).

## File Upload Expansion
- [x] **Test 9**: Verify "Entry to Building Photo" (Upload zone) is in the first section.
- [x] **Test 10**: Verify "Outside Space" in Facilities has a photo icon when toggled to "Yes".
- [x] **Test 11**: Verify "OC File Upload" is now a direct upload zone (not a toggle).

---
**Current Session Status**: 🏁 Complete (Pass)
**Last Result**: Step 3 verified after fixing PropertyDetail.js crash.
