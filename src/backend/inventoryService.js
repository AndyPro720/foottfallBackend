import { 
  collection, doc, getDoc, getDocs, updateDoc, deleteDoc, setDoc,
  query, where, serverTimestamp, getDocsFromCache, getDocsFromServer, getDocFromCache, getDocFromServer
} from "firebase/firestore";
import { db, auth } from "./firebaseConfig.js";
import { getCurrentUserRole } from "./userRoleService.js";
import { validateInventoryPayload } from "./inventoryValidator.js";

const INVENTORY_COLLECTION = "inventory";

function describeValue(value) {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `array(${value.length})`;
  if (typeof value === "object") {
    if (typeof value?.toDate === "function" || typeof value?.toMillis === "function") {
      return "firestore-timestamp";
    }
    if ("seconds" in value && "nanoseconds" in value) {
      return "firestore-timestamp-like";
    }
    if ("_methodName" in value) {
      return `fieldValue:${value._methodName}`;
    }
    return "object";
  }
  return typeof value;
}

function buildDebugShape(data) {
  return Object.fromEntries(
    Object.entries(data || {}).map(([key, value]) => {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return [key, {
          type: describeValue(value),
          keys: Object.keys(value).slice(0, 20),
        }];
      }
      return [key, {
        type: describeValue(value),
        value,
      }];
    })
  );
}

function logInventoryWriteDebug(label, payload, error = null) {
  if (typeof window === "undefined") return;

  const authUser = auth.currentUser;
  const debugInfo = {
    label,
    auth: authUser ? {
      uid: authUser.uid,
      email: authUser.email,
      displayName: authUser.displayName,
    } : null,
    profile: window.userProfile || null,
    payload,
    payloadShape: buildDebugShape(payload),
    error: error ? {
      code: error.code,
      message: error.message,
      name: error.name,
    } : null,
    at: new Date().toISOString(),
  };

  window.__inventoryCreateDebug = debugInfo;
  console.groupCollapsed(`[inventory-debug] ${label}`);
  console.log(debugInfo);
  console.groupEnd();
}

/** Race a promise against a timeout. */
function withTimeout(promise, ms, message = "Operation timed out") {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function expandDotNotation(data) {
  const expanded = {};
  Object.entries(data || {}).forEach(([key, value]) => {
    if (!key.includes(".")) {
      expanded[key] = value;
      return;
    }
    const path = key.split(".");
    let cursor = expanded;
    for (let i = 0; i < path.length - 1; i++) {
      const part = path[i];
      if (!cursor[part] || typeof cursor[part] !== "object") {
        cursor[part] = {};
      }
      cursor = cursor[part];
    }
    cursor[path[path.length - 1]] = value;
  });
  return expanded;
}

function isMissingDocError(error) {
  const message = String(error?.message || "");
  return error?.code === "not-found" || message.includes("No document to update");
}

function timestampToNumber(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.seconds === "number") return ts.seconds * 1000;
  const numeric = Number(ts);
  return Number.isFinite(numeric) ? numeric : 0;
}

function listSignature(items) {
  return (items || [])
    .map((item) => [
      item.id,
      timestampToNumber(item.updated_at),
      timestampToNumber(item.created_at),
      item.status || "active",
      item.mediaUploadPending ? 1 : 0,
      item.syncPending ? 1 : 0,
    ].join("|"))
    .join("::");
}

function itemSignature(item) {
  if (!item) return "";
  return [
    item.id,
    timestampToNumber(item.updated_at),
    timestampToNumber(item.created_at),
    item.status || "active",
    item.mediaUploadPending ? 1 : 0,
    item.syncPending ? 1 : 0,
  ].join("|");
}

function mapInventoryDoc(docSnap) {
  return {
    id: docSnap.id,
    ...docSnap.data(),
    syncPending: docSnap.metadata.hasPendingWrites,
  };
}

function chunkValues(values, size) {
  const chunks = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

function dedupeInventoryItems(items) {
  const byId = new Map();
  (items || []).forEach((item) => {
    if (!item?.id) return;
    byId.set(item.id, item);
  });
  return [...byId.values()];
}

function buildInventoryQuery(filters, role, uid, projectIdChunk = null) {
  let q = query(collection(db, INVENTORY_COLLECTION));

  if (role !== 'admin' && role !== 'superadmin' && uid) {
    if (Array.isArray(projectIdChunk) && projectIdChunk.length > 0) {
      q = query(q, where("projectId", "in", projectIdChunk));
    } else {
      q = query(q, where("createdBy", "==", uid));
    }
  }

  for (const [key, value] of Object.entries(filters)) {
    q = query(q, where(key, "==", value));
  }

  return q;
}

async function executeInventoryQueries(queries, reader) {
  const results = await Promise.allSettled(queries.map((q) => reader(q)));
  const fulfilled = results.filter((result) => result.status === 'fulfilled');
  if (fulfilled.length === 0) {
    const firstFailure = results.find((result) => result.status === 'rejected');
    throw firstFailure?.reason || new Error("Inventory query failed");
  }

  return dedupeInventoryItems(
    fulfilled.flatMap((result) => result.value.docs.map(mapInventoryDoc))
  );
}

/**
 * Creates a new inventory item.
 * @param {Object} data The inventory property data.
 * @returns {Promise<string>} The added document ID.
 */
export async function createInventoryItem(data) {
  try {
    const docRef = doc(collection(db, INVENTORY_COLLECTION));
    const writeData = {
      ...data,
      createdBy: auth.currentUser?.uid || "system",
      creatorEmail: auth.currentUser?.email || "unknown",
      creatorName: auth.currentUser?.displayName || auth.currentUser?.email?.split('@')[0] || "unknown",
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    };

    // Pre-flight validation: catch rule violations BEFORE hitting Firestore
    // so we can show the user exactly which field is wrong.
    const validation = validateInventoryPayload(writeData);
    if (!validation.valid) {
      const detail = validation.errors.join('\n• ');
      console.error('[inventory-validate] Pre-flight failed:\n•', detail);
      logInventoryWriteDebug("preflight-failed", writeData, {
        code: 'validation/preflight',
        message: detail,
        name: 'ValidationError',
      });
      throw new Error(`Validation failed:\n• ${detail}`);
    }

    logInventoryWriteDebug("before-create", writeData);

    // Wait for local persistence commit so immediate follow-up writes (media URLs)
    // do not race against document creation.
    await setDoc(docRef, writeData);

    logInventoryWriteDebug("create-success", {
      docId: docRef.id,
      ...writeData,
    });
    return docRef.id;
  } catch (error) {
    logInventoryWriteDebug("create-failed", data, error);
    console.error("Error adding inventory item:", error);
    throw error;
  }
}

/**
 * Gets a single inventory item by ID.
 * @param {string} id The document ID.
 * @param {Function} onNewData Optional callback fired if background sync finds updated data.
 * @returns {Promise<Object|null>} The document data or null if not found.
 */
export async function getInventoryItemById(id, onNewData = null) {
  try {
    const docRef = doc(db, INVENTORY_COLLECTION, id);
    
    // 1. Try Cache First for zero-latency load
    try {
      const cacheSnap = await getDocFromCache(docRef);
      if (cacheSnap.exists()) {
        const cachedItem = { id: cacheSnap.id, ...cacheSnap.data() };
        
        // 2. Background Sync
        if (navigator.onLine) {
          getDocFromServer(docRef).then(serverSnap => {
            if (serverSnap.exists()) {
              const serverItem = { id: serverSnap.id, ...serverSnap.data() };
              // Basic diff calculation
              if (itemSignature(cachedItem) !== itemSignature(serverItem)) {
                if (onNewData) onNewData(serverItem);
              }
            }
          }).catch(e => console.warn("Background detail sync failed", e));
        }
        
        return cachedItem;
      }
    } catch (e) {
      // Ignore cache misses
    }

    // 3. Fallback to quick server read
    const docSnap = await withTimeout(getDocFromServer(docRef), 5000, "Server read timeout");
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() };
    } else {
      console.warn("No such document!");
      return null;
    }
  } catch (error) {
    if (error.message === "Server read timeout") return null; // Graceful offline/timeout
    console.error("Error getting inventory item:", error);
    throw error;
  }
}

/**
 * Gets inventory items, optionally filtered.
 * @param {Object} filters Key-value pairs matching Firestore fields (simple equality).
 * @param {Function} onNewData Optional callback fired if background sync finds updated data.
 * @returns {Promise<Array>} Array of inventory documents.
 */
export async function getInventoryItems(filters = {}, onNewData = null, options = {}) {
  try {
    const { projectIds = [], preferFresh = false } = options;

    // Role-based filtering: Only admins see everything. 
    // Regular users (agents) see:
    // 1. Items they created
    // 2. Items in projects they own (provided via options.projectIds)
    const role = (typeof window !== "undefined" && window.userProfile?.role)
      ? window.userProfile.role
      : await getCurrentUserRole();
    const uid = auth.currentUser?.uid;
    if (role !== 'admin' && role !== 'superadmin' && !uid) {
      return [];
    }
    const normalizedProjectIds = [...new Set(projectIds.filter(Boolean))];
    const projectIdChunks = role !== 'admin' && role !== 'superadmin' && normalizedProjectIds.length > 0
      ? chunkValues(normalizedProjectIds, 30)
      : [];
    const queries = projectIdChunks.length > 0
      ? projectIdChunks.map((chunk) => buildInventoryQuery(filters, role, uid, chunk))
      : [buildInventoryQuery(filters, role, uid)];

    let cachedItems = null;
    try {
      cachedItems = await executeInventoryQueries(queries, (q) => getDocsFromCache(q));
      if (!preferFresh && cachedItems.length > 0) {
        if (navigator.onLine && onNewData) {
          executeInventoryQueries(queries, (q) => getDocsFromServer(q)).then((serverItems) => {
            if (listSignature(cachedItems) !== listSignature(serverItems)) {
              onNewData(serverItems);
            }
          }).catch(e => console.warn("Background list sync failed", e));
        }
        return cachedItems;
      }
    } catch (e) {
      // Ignore cache read failures 
    }

    try {
      return await executeInventoryQueries(
        queries,
        (q) => withTimeout(getDocsFromServer(q), 5000, "Server timeout")
      );
    } catch (e) {
      if (cachedItems) return cachedItems;
      if (e.message === "Server timeout") return []; // Return gracefully instead of crashing UI
      throw e;
    }
  } catch (error) {
    console.error("Error fetching inventory items:", error);
    throw error;
  }
}

/**
 * Updates an inventory item.
 * @param {string} id The document ID.
 * @param {Object} data The data to update.
 */
export async function updateInventoryItem(id, data) {
  try {
    const docRef = doc(db, INVENTORY_COLLECTION, id);
    const writeData = {
      ...data,
      updated_at: serverTimestamp(),
    };

    try {
      const updatePromise = updateDoc(docRef, writeData);
      await withTimeout(updatePromise, 3000, "TIMEOUT_QUEUED");
      return;
    } catch (updateError) {
      if (!isMissingDocError(updateError)) {
        if (updateError.message !== "TIMEOUT_QUEUED") throw updateError;
        return;
      }
    }

    const fallbackWrite = expandDotNotation(writeData);
    const setPromise = setDoc(docRef, fallbackWrite, { merge: true });
    try {
      await withTimeout(setPromise, 3000, "TIMEOUT_QUEUED");
    } catch (setError) {
      if (setError.message !== "TIMEOUT_QUEUED") throw setError;
    }
  } catch (error) {
    console.error("Error updating inventory item:", error);
    throw error;
  }
}

/**
 * Deletes an inventory item.
 * @param {string} id The document ID.
 */
export async function deleteInventoryItem(id) {
  try {
    const docRef = doc(db, INVENTORY_COLLECTION, id);
    await deleteDoc(docRef);
  } catch (error) {
    console.error("Error deleting inventory item:", error);
    throw error;
  }
}
