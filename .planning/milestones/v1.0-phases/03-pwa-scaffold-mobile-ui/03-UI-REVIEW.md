# Phase 3 — UI Review

**Audited:** 2026-03-28
**Baseline:** 03-UI-SPEC.md (approved 2026-03-27)
**Screenshots:** captured (dashboard only — form verified via code)

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Contract CTAs match exactly; "Connection Error" heading deviates from spec copy |
| 2. Visuals | 2/4 | No loading skeleton, stuck "Loading properties..." state visible in screenshot, no visual focal hierarchy beyond text size |
| 3. Color | 3/4 | CSS variables match spec; hardcoded `rgba()` values in inline styles bypass the token system |
| 4. Typography | 3/4 | Inter font loaded, weights and sizes generally correct; inline `font-size` values don't use CSS tokens |
| 5. Spacing | 2/4 | All spacing via inline styles (`margin-bottom: 0.5rem`), no reusable spacing tokens; spec defines xs-3xl scale but no CSS classes exist |
| 6. Experience Design | 3/4 | Loading/empty/error states all handled; form error uses `alert()` instead of inline UI; no success toast on submit |

**Overall: 16/24**

---

## Top 3 Priority Fixes

1. **Inline styles everywhere** — Spacing, typography, and color values are hardcoded as `style=""` attributes in JS template literals instead of using CSS classes. This makes the design system tokens in `style.css` decorative rather than functional. **Fix:** Create CSS utility classes (`.mb-sm`, `.text-label`, `.error-border`) that reference the CSS custom properties, then replace inline styles.

2. **Dashboard stuck on "Loading properties..."** — The screenshot shows the dashboard permanently displaying "Loading properties..." without resolving to the empty or populated state. The async `getInventoryItems()` call may be hanging or the Firestore database propagation is slow. **Fix:** Add a timeout fallback (e.g., 5 seconds) that shows the empty state if the fetch hasn't resolved, and add a proper skeleton loader animation during the wait.

3. **Form error uses `alert()` instead of inline feedback** — `IntakeForm.js:46` uses `alert('Unable to connect...')` which breaks the glassmorphic premium feel and requires browser-level dismiss. **Fix:** Replace with an inline error card below the form button, matching the `.glass-card` error pattern used in `Home.js`.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

**Matches contract:**
- ✓ Primary CTA: `"Register New Retail Property"` (IntakeForm.js:21) — exact match
- ✓ Empty state heading: `"No Inventory Yet"` (Home.js:16) — exact match
- ✓ Empty state body: `"Tap the Add Inventory button below..."` (Home.js:17) — exact match
- ✓ Error state: `"Unable to connect to backend. Please check your connection."` (Home.js:46) — exact match

**Deviations:**
- `"Connection Error"` heading (Home.js:45) — not in the copywriting contract. The spec doesn't define error headings.
- `"Configuration Error"` heading (main.js:55) — developer fallback state, acceptable but not in spec.
- `"Add New Property"` page heading (IntakeForm.js:6) — not explicitly in spec, but reasonable.
- `"Saving..."` loading text (IntakeForm.js:30) — not in spec.

### Pillar 2: Visuals (2/4)

**Issues found:**
- No skeleton loading state — the "Loading properties..." text is plain text, not an animated skeleton. The spec describes "placeholder skeleton states" (from PLAN.md).
- Dashboard screenshot shows permanent "Loading properties..." card — the resolved empty/data state is never visible in the captured screenshot (hung fetch).
- No visual hierarchy differentiation between the "Inventory Dashboard" heading and the "No Inventory Yet" heading — both use `<h1>` with no size/weight variation.
- SVG icons are inline (not from Lucide CDN as spec declares). This works but isn't what UI-SPEC prescribed.
- No micro-animations present (no transition on card entry, no fade between routes).

**Working well:**
- Glassmorphic `.glass-card` renders correctly with blur and border.
- Bottom nav has active state highlight using accent white color.

### Pillar 3: Color (3/4)

**Matches contract:**
- ✓ `--dominant: #0a3622` (style.css:2)
- ✓ `--secondary: rgba(255, 255, 255, 0.1)` (style.css:3)
- ✓ `--accent: #ffffff` (style.css:4)
- ✓ `--destructive: #ef4444` (style.css:5)
- ✓ Bottom nav uses `rgba(10, 54, 34, 0.85)` — derived from dominant, acceptable.
- ✓ Accent used for CTA background (`.btn-frosted`) and active nav — matches spec "reserved for" list.

**Issues:**
- Hardcoded `rgba(255,255,255,0.2)` for input borders (IntakeForm.js:10,14,18) — should reference token.
- Hardcoded `rgba(0,0,0,0.2)` for input backgrounds (IntakeForm.js:10,14,18) — no token defined for this.
- Hardcoded `rgba(0,0,0,0.3)` in error pre block (main.js:57) — should be tokenized.

### Pillar 4: Typography (3/4)

**Matches contract:**
- ✓ Inter font loaded via Google Fonts (index.html:11).
- ✓ `font-family: 'Inter', sans-serif` applied to body (style.css:17).
- ✓ Labels use `14px` / `font-weight: 600` (IntakeForm.js:9) — matches spec Label role.
- ✓ Nav labels use `12px` / `font-weight: 600` (style.css:89-90) — reasonable for small nav text.

**Issues:**
- Font sizes are defined as inline styles (`font-size: 14px`, `font-size: 0.9em`, `font-size: 12px`) rather than CSS classes referencing the spec typography scale.
- No `Display` role (32px/700) is used anywhere — the spec declares it but it's never applied.
- `<h1>` elements have no explicit font-size set — they rely on browser defaults rather than the spec's Heading role (24px/600).

### Pillar 5: Spacing (2/4)

**Issues:**
- The UI-SPEC defines a 7-step spacing scale (xs: 4px through 3xl: 64px) but **no CSS classes** were created for any of them. All spacing is hardcoded inline:
  - `margin-bottom: 2rem` (Home.js:5)
  - `margin-bottom: 0.5rem` (Home.js:16, 26)
  - `margin-bottom: 1rem` (Home.js:17, 25)
  - `margin-bottom: 1.5rem` (IntakeForm.js:6)
  - `gap: 1rem` (IntakeForm.js:7)
  - `padding: 12px` (IntakeForm.js:10) — 12px is NOT on the 4px-multiple scale (should be 12 → 16px).
  - `margin-bottom: 6px` (IntakeForm.js:9) — 6px is NOT a multiple of 4.
- `.glass-card` padding uses `1.5rem` (24px) — matches `lg` token, but isn't referenced by name.
- Touch target spec says min 44px — button padding `12px 24px` results in ~44px height depending on font, borderline pass.

### Pillar 6: Experience Design (3/4)

**State coverage:**
- ✓ Loading state: "Loading properties..." text rendered immediately (Home.js:7).
- ✓ Empty state: "No Inventory Yet" card with actionable guidance (Home.js:14-19).
- ✓ Error state: Dedicated error card with destructive color (Home.js:42-48).
- ✓ Form loading: Button text changes to "Saving..." with disabled state and opacity change (IntakeForm.js:30-32).
- ✓ Form error: Error is surfaced (IntakeForm.js:46) — but uses `alert()`.

**Issues:**
- Form error uses browser `alert()` (IntakeForm.js:46) — breaks premium glassmorphic experience.
- No success feedback on form submit — user is silently redirected to `#` after save (IntakeForm.js:44). Should show a brief toast or success card.
- No confirmation dialog for any destructive action — spec defines destructive copy but no delete functionality exists yet (this may be Phase 4 scope).
- `router()` catch block shows a "Configuration Error" — good resilience, but the error text is developer-facing, not end-user-facing.

---

## Files Audited
- `src/style.css` (102 lines)
- `src/main.js` (74 lines)
- `src/pages/Home.js` (51 lines)
- `src/pages/IntakeForm.js` (54 lines)
- `index.html` (18 lines)
- `03-UI-SPEC.md` (baseline)
