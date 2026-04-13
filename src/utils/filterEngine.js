// ─── Filter Engine ───
// Pure functions for searching, filtering, and sorting property items.
// Consumed by Home.js (Phase 10) and future Dashboard (Phase 11).

/**
 * @typedef {Object} FilterState
 * @property {string} searchText - Free-text search query
 * @property {string} sortKey - One of: 'newest', 'price-asc', 'price-desc', 'size-asc', 'size-desc'
 * @property {string[]} buildingTypes - e.g. ['Mall', 'High Street']
 * @property {string[]} propertyStatuses - e.g. ['Available']
 * @property {string[]} cities - e.g. ['Pune', 'Mumbai']
 * @property {string[]} tradeAreas - e.g. ['MG Road']
 * @property {string[]} createdByUids - admin only
 * @property {number|null} priceMin
 * @property {number|null} priceMax
 * @property {number|null} sizeMin
 * @property {number|null} sizeMax
 * @property {string} floor - text match
 * @property {'yes'|'no'|'any'} mezzanine
 * @property {'yes'|'no'|'any'} hasPhotos
 * @property {string} suitableFor - text match
 */

/** Returns a blank filter state with sensible defaults */
export function createEmptyFilterState() {
  return {
    searchText: '',
    sortKey: 'newest',
    buildingTypes: [],
    propertyStatuses: [],
    cities: [],
    tradeAreas: [],
    createdByUids: [],
    priceMin: null,
    priceMax: null,
    sizeMin: null,
    sizeMax: null,
    floor: '',
    mezzanine: 'any',
    hasPhotos: 'any',
    suitableFor: '',
  };
}

/** Check if any filter is active (excluding sort and search) */
export function hasActiveFilters(state) {
  return (
    state.buildingTypes.length > 0 ||
    state.propertyStatuses.length > 0 ||
    state.cities.length > 0 ||
    state.tradeAreas.length > 0 ||
    state.createdByUids.length > 0 ||
    state.priceMin !== null ||
    state.priceMax !== null ||
    state.sizeMin !== null ||
    state.sizeMax !== null ||
    state.floor !== '' ||
    state.mezzanine !== 'any' ||
    state.hasPhotos !== 'any' ||
    state.suitableFor !== ''
  );
}

/** Count how many individual filter facets are active */
export function countActiveFilters(state) {
  let count = 0;
  count += state.buildingTypes.length;
  count += state.propertyStatuses.length;
  count += state.cities.length;
  count += state.tradeAreas.length;
  count += state.createdByUids.length;
  if (state.priceMin !== null) count++;
  if (state.priceMax !== null) count++;
  if (state.sizeMin !== null) count++;
  if (state.sizeMax !== null) count++;
  if (state.floor) count++;
  if (state.mezzanine !== 'any') count++;
  if (state.hasPhotos !== 'any') count++;
  if (state.suitableFor) count++;
  return count;
}

// ─── Internal Helpers ───

function safeString(val) {
  return String(val || '').trim().toLowerCase();
}

function safeNumber(val) {
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function getTimestampMillis(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  const num = Number(ts);
  return Number.isFinite(num) ? num : 0;
}

function countPhotos(item) {
  const cats = ['buildingFacade', 'unitFacade', 'interior', 'signage', 'floorPlan', 'entryToBuilding'];
  let total = 0;
  if (item.images) {
    cats.forEach(cat => {
      total += (item.images[cat] || []).length;
    });
  }
  return total;
}

// ─── Search ───

function matchesSearch(item, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  const fields = [
    item.name,
    item.tradeArea,
    item.city,
    item.location,
    item.suitableFor,
    item.frontage,
    item.vicinityBrands,
    item.miscNotes,
  ];
  return fields.some(f => safeString(f).includes(q));
}

// ─── Filters ───

function matchesFilters(item, state) {
  // Building Type (OR within category)
  if (state.buildingTypes.length > 0) {
    const itemType = safeString(item.buildingType);
    if (!state.buildingTypes.some(t => safeString(t) === itemType)) return false;
  }

  // Property Status (OR within category)
  if (state.propertyStatuses.length > 0) {
    const itemStatus = safeString(item.propertyStatus);
    if (!state.propertyStatuses.some(s => safeString(s) === itemStatus)) return false;
  }

  // City (OR within category) — uses inferred city for legacy data
  if (state.cities.length > 0) {
    const itemCity = safeString(inferCity(item));
    if (!state.cities.some(c => safeString(c) === itemCity)) return false;
  }

  // Trade Area (OR within category)
  if (state.tradeAreas.length > 0) {
    const itemArea = safeString(item.tradeArea);
    if (!state.tradeAreas.some(a => safeString(a) === itemArea)) return false;
  }

  // Created By (OR within category, admin only)
  if (state.createdByUids.length > 0) {
    if (!state.createdByUids.includes(item.createdBy)) return false;
  }

  // Price range
  const price = safeNumber(item.price);
  if (state.priceMin !== null && (price === null || price < state.priceMin)) return false;
  if (state.priceMax !== null && (price === null || price > state.priceMax)) return false;

  // Size range
  const size = safeNumber(item.size);
  if (state.sizeMin !== null && (size === null || size < state.sizeMin)) return false;
  if (state.sizeMax !== null && (size === null || size > state.sizeMax)) return false;

  // Floor (text contains)
  if (state.floor) {
    if (!safeString(item.floor).includes(state.floor.toLowerCase())) return false;
  }

  // Mezzanine
  if (state.mezzanine === 'yes' && !item.mezzanine) return false;
  if (state.mezzanine === 'no' && item.mezzanine) return false;

  // Has Photos
  if (state.hasPhotos === 'yes' && countPhotos(item) === 0) return false;
  if (state.hasPhotos === 'no' && countPhotos(item) > 0) return false;

  // Suitable For (text contains)
  if (state.suitableFor) {
    if (!safeString(item.suitableFor).includes(state.suitableFor.toLowerCase())) return false;
  }

  return true;
}

// ─── Sort ───

function compareItems(a, b, sortKey) {
  switch (sortKey) {
    case 'newest': {
      const ta = getTimestampMillis(a.created_at);
      const tb = getTimestampMillis(b.created_at);
      return tb - ta; // descending
    }
    case 'price-asc': {
      const pa = safeNumber(a.price) ?? Infinity;
      const pb = safeNumber(b.price) ?? Infinity;
      return pa - pb;
    }
    case 'price-desc': {
      const pa = safeNumber(a.price) ?? -Infinity;
      const pb = safeNumber(b.price) ?? -Infinity;
      return pb - pa;
    }
    case 'size-asc': {
      const sa = safeNumber(a.size) ?? Infinity;
      const sb = safeNumber(b.size) ?? Infinity;
      return sa - sb;
    }
    case 'size-desc': {
      const sa = safeNumber(a.size) ?? -Infinity;
      const sb = safeNumber(b.size) ?? -Infinity;
      return sb - sa;
    }
    default:
      return 0;
  }
}

// ─── Main Pipeline ───

/**
 * Apply the full search → filter → sort pipeline.
 * @param {Object[]} items - Raw property items
 * @param {FilterState} state - Current filter state
 * @returns {Object[]} Filtered and sorted items (new array, does not mutate input)
 */
export function applyFilters(items, state) {
  let result = items;

  // 1. Search
  if (state.searchText) {
    result = result.filter(item => matchesSearch(item, state.searchText));
  }

  // 2. Filters
  if (hasActiveFilters(state)) {
    result = result.filter(item => matchesFilters(item, state));
  }

  // 3. Sort
  result = [...result].sort((a, b) => compareItems(a, b, state.sortKey));

  return result;
}

// ─── Facet Extraction (for dynamic chip generation) ───

/**
 * Default city for properties that have a tradeArea but no city.
 * The user confirmed ~90% of legacy trade areas belong to Pune.
 * Non-Pune trade areas can be listed separately as they are identified.
 */
const NON_PUNE_TRADE_AREAS = {
  // 'Bandra': 'Mumbai',
  // 'Andheri': 'Mumbai',
  // Add known non-Pune trade areas here as needed
};

function inferCity(item) {
  const explicit = String(item.city || '').trim();
  if (explicit) return explicit;
  const ta = String(item.tradeArea || '').trim();
  if (!ta) return '';
  // Check the exceptions map first
  if (NON_PUNE_TRADE_AREAS[ta]) return NON_PUNE_TRADE_AREAS[ta];
  // Default: if property has a trade area but no city, it's Pune
  return 'Pune';
}

/**
 * Extract unique values for faceted chip generation.
 * @param {Object[]} items - All property items (unfiltered)
 * @returns {Object} Facet values for UI generation
 */
export function extractFacets(items) {
  const tradeAreas = new Set();
  const cities = new Set();
  const buildingTypes = new Set();
  const propertyStatuses = new Set();
  const cityTradeAreaMap = {};

  items.forEach(item => {
    const city = inferCity(item);
    if (city) {
      cities.add(city);
      if (!cityTradeAreaMap[city]) cityTradeAreaMap[city] = new Set();
    }

    const ta = String(item.tradeArea || '').trim();
    if (ta) {
      tradeAreas.add(ta);
      if (city) {
        cityTradeAreaMap[city].add(ta);
      }
    }
    
    const bt = String(item.buildingType || '').trim();
    if (bt) buildingTypes.add(bt);
    
    const ps = String(item.propertyStatus || '').trim();
    if (ps) propertyStatuses.add(ps);
  });

  // Convert sets to sorted arrays
  const finalCityMap = {};
  for (const c in cityTradeAreaMap) {
    finalCityMap[c] = [...cityTradeAreaMap[c]].sort();
  }

  return {
    cities: [...cities].sort(),
    tradeAreas: [...tradeAreas].sort(),
    cityTradeAreaMap: finalCityMap,
    buildingTypes: [...buildingTypes].sort(),
    propertyStatuses: [...propertyStatuses].sort(),
  };
}

/** Sort option definitions for UI rendering */
export const SORT_OPTIONS = [
  { key: 'newest', label: 'Newest' },
  { key: 'price-asc', label: 'Price: Low → High' },
  { key: 'price-desc', label: 'Price: High → Low' },
  { key: 'size-asc', label: 'Size: Small → Large' },
  { key: 'size-desc', label: 'Size: Large → Small' },
];
