# Phase 10: Mobile Search & Filtering - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Implementing a Notion-inspired search, sort, and filter system on the Home page. The engine must be reusable for Phase 11 (Desktop Dashboard). Covers SEARCH-01, SEARCH-02, SEARCH-03.

</domain>

<decisions>
## Implementation Decisions

### Search Bar
- **D-01:** **Placement** — Inside the `page-header` on the Home page (scrolls with content, not fixed in the top bar).
- **D-02:** **Basic Search Scope** — Text search matches against: `name`, `tradeArea`, `location`, `suitableFor`. Case-insensitive, partial match (contains).
- **D-03:** **Debounce** — 150ms debounce on keystroke to avoid jank on large lists.
- **D-04:** **Filter Icon** — The search bar has a filter icon/button on the right end that opens the advanced filter panel.

### Quick-Access Chips (Below Search Bar)
- **D-05:** **Chip Bar** — Horizontal-scrolling row of chips below the search bar for the most common filters:
  - **Trade Area** — Dynamic values extracted from the loaded data (unique `tradeArea` values)
  - **Building Type** — Mall / Standalone / High Street (from field config)
  - **Property Status** — Occupied / Available / Under Construction (from field config)
  - **Created By** (admin only) — Dynamic values from the user name map
- **D-06:** **Chip Behavior** — Tapping a chip toggles it. Multiple chips in the same category are OR-ed (e.g., "Mall" OR "High Street"). Chips across categories are AND-ed (e.g., Mall AND Available).
- **D-07:** **Active Count** — When filters are active, show a count badge near the filter icon (e.g., "3" if 3 filters are active).

### Sort Control
- **D-08:** **Sort Pill** — A dedicated sort pill/chip in the chip bar row (leftmost position) showing current sort label (e.g., "Newest").
- **D-09:** **Sort Options** — Tapping the sort pill shows a small dropdown/popover:
  - Newest First (default)
  - Price: Low → High
  - Price: High → Low
  - Size: Small → Large
  - Size: Large → Small
- **D-10:** **Default Sort** — Newest first (by `created_at` timestamp descending).

### Advanced Filter Panel
- **D-11:** **UI Pattern** — Bottom sheet / slide-up panel triggered by the filter icon on the search bar.
- **D-12:** **Advanced Fields** — Covers ALL filterable property fields:
  - Building Type (multi-select chips)
  - Property Status (multi-select chips)
  - Trade Area (combobox / searchable multi-select)
  - Price Range (₹/sqft) — min/max number inputs
  - Size Range (sqft) — min/max number inputs
  - Floor (text filter)
  - Mezzanine (Yes/No/Any toggle)
  - Suitable For (text search)
  - Has Photos (Yes/No/Any toggle)
  - Created By (admin only — user picker)
- **D-13:** **Apply / Clear** — The panel has "Apply Filters" (primary) and "Clear All" (secondary) buttons.
- **D-14:** **Result Count** — Show a live "X results" count at the bottom of the panel as user adjusts filters before applying.

### State Persistence
- **D-15:** **Persist on Navigate-Away** — When user views a property and comes back, search text, active filters, sort order, AND scroll position are all restored.
- **D-16:** **Storage** — Use module-level variables (same lifetime as the Home.js module). No need for `sessionStorage` for filter state (the module singleton persists across hash navigations).

### Architecture: Reusability for Phase 11
- **D-17:** **Shared Filter Engine** — Extract the filter/sort/search logic into a standalone module (`src/utils/filterEngine.js`) that takes an items array + filter state and returns filtered+sorted results. Both Home (Phase 10) and Dashboard (Phase 11) will consume this.
- **D-18:** **No Separate Dashboard Page Yet** — Phase 10 focuses on making Home work beautifully on mobile. Phase 11 will add the desktop-optimized view (possibly the same route with responsive layout, or a separate `#dashboard` route). Decision deferred to Phase 11 discussion.

### Cache Strategy
- **D-19:** **Data Cache vs. HTML Cache** — The current `homeCacheHtml` approach caches the rendered HTML string. With search/filter, we need to cache the DATA (items array) instead and re-render cards on filter changes. The HTML cache will be replaced by a data cache.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Documentation
- `.planning/PROJECT.md` — Core vision for v2.0.0
- `.planning/REQUIREMENTS.md` — SEARCH-01 to SEARCH-03 requirements
- `.planning/ROADMAP.md` — Phase 10 success criteria

### Codebase Patterns
- `src/pages/Home.js` — Current rendering pipeline with data cache, card builder, interaction attachment
- `src/config/propertyFields.js` — Canonical field definitions (drives advanced filter field list)
- `src/main.js` — Router and hash-based navigation
- `src/style.css` — Existing design tokens and component styles

### Key Functions
- `buildCardHtml(item, i, userNameMap)` — Card builder to reuse (Home.js:113-175)
- `getTimestampMillis(ts)` — Timestamp normalizer for sort-by-date (Home.js:7-13)
- `toFiniteNumber(value)` — Safe number parser for range filtering (Home.js:26-29)

</canonical_refs>

<deferred>
## Deferred Ideas
- **Desktop grid layout** — Deferred to Phase 11 (responsive grid, table view toggle).
- **Saved filter presets** — Nice-to-have but not in scope for v2.0.
- **Server-side search** — All filtering is client-side for now. Sufficient for <500 properties.
- **Full-text search with fuzzy matching** — Simple `includes()` is good enough for now.
</deferred>
