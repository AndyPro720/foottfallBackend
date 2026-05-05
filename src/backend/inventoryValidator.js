/**
 * Client-side pre-flight validation that mirrors Firestore security rules.
 * 
 * Firestore only returns "Missing or insufficient permissions" with no detail
 * about which rule failed. This module checks the payload BEFORE writing so
 * we can surface the exact failing field to the user.
 */

const INVENTORY_ALLOWED_KEYS = new Set([
  'name', 'unitName', 'projectId', 'frontage', 'vicinityBrands', 'miscNotes', 'propertyStatus',
  'completionTime', 'partOC', 'completeOC', 'buildingType', 'size',
  'floor', 'googleMapsLink', 'location', 'city', 'tradeArea',
  'suitableFor', 'presentationAvailable', 'presentationLink',
  'presentationFile', 'contactName', 'contactDesignation', 'contactInfo',
  'price', 'priceNegotiability', 'mergable', 'mezzanine', 'mezzanineSize',
  'clearHeight', 'clearHeightUnderMezz', 'clearHeightAboveMezz', 'cam',
  'connectedLoad', 'buildingAge', 'parking', 'parkingCount', 'parkingPhoto',
  'outsideSpace', 'outsideSpacePhoto', 'serviceEntry', 'serviceEntryPhoto',
  'liftAccess', 'liftAccessPhoto', 'bohSpace', 'bohSpacePhoto', 'fireExit',
  'ocFile', 'latitude', 'longitude', 'status', 'images',
  'mediaUploadPending', 'syncPending', 'createdBy', 'creatorEmail',
  'creatorName', 'created_at', 'updated_at'
]);

const REQUIRED_KEYS = ['name', 'status', 'createdBy', 'creatorEmail', 'creatorName', 'created_at', 'updated_at'];

const URL_PATTERN = /^https?:\/\//;

const OPTIONAL_STRING_FIELDS = {
  name: 200, unitName: 200, projectId: 200, frontage: 100, vicinityBrands: 1000, miscNotes: 5000,
  partOC: 200, completeOC: 200, floor: 100, propertyStatus: 100,
  buildingType: 100, priceNegotiability: 100, location: 2000,
  city: 120, tradeArea: 200, suitableFor: 1000, contactName: 200,
  contactDesignation: 200, contactInfo: 500, creatorEmail: 320, creatorName: 200,
};

const NUMBERISH_FIELDS = {
  completionTime: [0, 600], size: [0, 100000000], price: [0, 1000000000],
  mezzanineSize: [0, 100000000], clearHeight: [0, 10000],
  clearHeightUnderMezz: [0, 10000], clearHeightAboveMezz: [0, 10000],
  cam: [0, 1000000000], connectedLoad: [0, 10000000],
  buildingAge: [0, 1000], parkingCount: [0, 100000],
};

const NUMBER_FIELDS = {
  latitude: [-90, 90], longitude: [-180, 180],
};

const BOOL_LIKE_FIELDS = [
  'presentationAvailable', 'mergable', 'mezzanine', 'parking',
  'outsideSpace', 'serviceEntry', 'liftAccess', 'bohSpace', 'fireExit',
];

const STRICT_BOOL_FIELDS = ['mediaUploadPending', 'syncPending'];

const URL_FIELDS = [
  'googleMapsLink', 'presentationLink', 'parkingPhoto',
  'outsideSpacePhoto', 'serviceEntryPhoto', 'liftAccessPhoto', 'bohSpacePhoto',
];

const URL_OR_LIST_FIELDS = ['presentationFile', 'ocFile'];

const VALID_STATUSES = ['active', 'pending', 'inactive'];

/**
 * Validate a payload against the same rules Firestore enforces.
 * Returns { valid: true } or { valid: false, errors: [...] }
 */
export function validateInventoryPayload(data) {
  const errors = [];

  // 1. Check for unknown keys (mirrors hasOnly)
  for (const key of Object.keys(data)) {
    if (!INVENTORY_ALLOWED_KEYS.has(key)) {
      errors.push(`Unknown field "${key}" is not allowed. Remove it from the payload.`);
    }
  }

  // 2. Check required keys (mirrors hasAll)
  // Note: created_at/updated_at are added as serverTimestamp() sentinels, so we skip those
  for (const key of REQUIRED_KEYS) {
    if (key === 'created_at' || key === 'updated_at') continue; // sentinels
    if (!(key in data)) {
      errors.push(`Required field "${key}" is missing.`);
    }
  }

  // 3. Name validation
  if ('name' in data) {
    if (typeof data.name !== 'string') {
      errors.push(`"name" must be a string, got ${typeof data.name}.`);
    } else if (data.name.length === 0) {
      errors.push(`"name" cannot be empty.`);
    } else if (data.name.length > 200) {
      errors.push(`"name" is too long (${data.name.length} chars, max 200).`);
    }
  }

  // 4. Creator fields
  for (const field of ['createdBy', 'creatorEmail', 'creatorName']) {
    if (field in data && typeof data[field] !== 'string') {
      errors.push(`"${field}" must be a string, got ${typeof data[field]}.`);
    }
  }

  // 5. String fields
  for (const [field, maxLen] of Object.entries(OPTIONAL_STRING_FIELDS)) {
    if (!(field in data) || data[field] == null) continue;
    if (typeof data[field] !== 'string') {
      errors.push(`"${field}" must be a string or null, got ${typeof data[field]}.`);
    } else if (data[field].length > maxLen) {
      errors.push(`"${field}" is too long (${data[field].length} chars, max ${maxLen}).`);
    }
  }

  // 6. Status enum
  if ('status' in data && !VALID_STATUSES.includes(data.status)) {
    errors.push(`"status" must be one of: ${VALID_STATUSES.join(', ')}. Got "${data.status}".`);
  }

  // 7. Numberish fields (accept number, string, or null)
  for (const [field, [min, max]] of Object.entries(NUMBERISH_FIELDS)) {
    if (!(field in data) || data[field] == null) continue;
    if (typeof data[field] === 'number') {
      if (data[field] < min || data[field] > max) {
        errors.push(`"${field}" = ${data[field]} is out of range [${min}, ${max}].`);
      }
    } else if (typeof data[field] === 'string') {
      if (data[field].length > 32) {
        errors.push(`"${field}" string value is too long (max 32 chars).`);
      }
    } else {
      errors.push(`"${field}" must be a number, string, or null. Got ${typeof data[field]}.`);
    }
  }

  // 8. Strict number fields (latitude/longitude)
  for (const [field, [min, max]] of Object.entries(NUMBER_FIELDS)) {
    if (!(field in data)) continue;
    if (typeof data[field] !== 'number') {
      errors.push(`"${field}" must be a number, got ${typeof data[field]} ("${data[field]}").`);
    } else if (data[field] < min || data[field] > max) {
      errors.push(`"${field}" = ${data[field]} is out of range [${min}, ${max}].`);
    }
  }

  // 9. Bool-like fields (accept bool, string, or null)
  for (const field of BOOL_LIKE_FIELDS) {
    if (!(field in data) || data[field] == null) continue;
    const t = typeof data[field];
    if (t !== 'boolean' && t !== 'string') {
      errors.push(`"${field}" must be a boolean, string, or null. Got ${t}.`);
    }
  }

  // 10. Strict bool fields
  for (const field of STRICT_BOOL_FIELDS) {
    if (!(field in data)) continue;
    if (typeof data[field] !== 'boolean') {
      errors.push(`"${field}" must be a boolean, got ${typeof data[field]}.`);
    }
  }

  // 11. URL fields — MUST start with http:// or https://
  for (const field of URL_FIELDS) {
    if (!(field in data) || data[field] == null) continue;
    if (typeof data[field] !== 'string') {
      errors.push(`"${field}" must be a URL string or null. Got ${typeof data[field]}.`);
    } else if (!URL_PATTERN.test(data[field])) {
      errors.push(`"${field}" must start with http:// or https://. Got "${data[field].substring(0, 50)}...".`);
    } else if (data[field].length > 2048) {
      errors.push(`"${field}" URL is too long (${data[field].length} chars, max 2048).`);
    }
  }

  // 12. URL-or-list fields
  for (const field of URL_OR_LIST_FIELDS) {
    if (!(field in data) || data[field] == null) continue;
    if (Array.isArray(data[field])) {
      if (data[field].length > 50) {
        errors.push(`"${field}" list has too many items (${data[field].length}, max 50).`);
      }
    } else if (typeof data[field] === 'string') {
      if (data[field].length > 2048) {
        errors.push(`"${field}" is too long (${data[field].length} chars, max 2048).`);
      }
    } else {
      errors.push(`"${field}" must be a list, URL string, or null. Got ${typeof data[field]}.`);
    }
  }

  // 13. Images must be a map/object (not array, not string)
  if ('images' in data && data.images != null) {
    if (typeof data.images !== 'object' || Array.isArray(data.images)) {
      errors.push(`"images" must be a map/object. Got ${Array.isArray(data.images) ? 'array' : typeof data.images}.`);
    }
  }

  return errors.length > 0
    ? { valid: false, errors }
    : { valid: true, errors: [] };
}
