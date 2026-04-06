import { 
  collection, doc, getDoc, getDocs, updateDoc, deleteDoc, setDoc,
  query, where, serverTimestamp, getDocsFromCache, getDocsFromServer, getDocFromCache, getDocFromServer
} from "firebase/firestore";
import { db, auth } from "./firebaseConfig.js";
import { getCurrentUserRole } from "./userRoleService.js";

const INVENTORY_COLLECTION = "inventory";

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

    // Wait for local persistence commit so immediate follow-up writes (media URLs)
    // do not race against document creation.
    await setDoc(docRef, writeData);

    return docRef.id;
  } catch (error) {
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
export async function getInventoryItems(filters = {}, onNewData = null) {
  try {
    let q = query(collection(db, INVENTORY_COLLECTION));

    // Role-based filtering: Only admins see everything. Regular users (agents) see only their own.
    const role = (typeof window !== "undefined" && window.userProfile?.role)
      ? window.userProfile.role
      : await getCurrentUserRole();
    if (role !== 'admin') {
      const uid = auth.currentUser?.uid;
      if (uid) {
        q = query(q, where("createdBy", "==", uid));
      }
    }

    // Apply additional filters
    for (const [key, value] of Object.entries(filters)) {
      q = query(q, where(key, "==", value));
    }

    // 1. Try Cache First for Instant Rendering
    try {
      const cacheSnapshot = await getDocsFromCache(q);
      if (!cacheSnapshot.empty) {
        const cachedItems = cacheSnapshot.docs.map(d => ({ 
          id: d.id, ...d.data(), syncPending: d.metadata.hasPendingWrites
        }));
        
        // 2. Queue Background Background Sync
        if (navigator.onLine) {
          getDocsFromServer(q).then(serverSnapshot => {
            const serverItems = serverSnapshot.docs.map(d => ({ 
              id: d.id, ...d.data(), syncPending: d.metadata.hasPendingWrites
            }));
            
            // Basic data diff logic
            if (listSignature(cachedItems) !== listSignature(serverItems)) {
              if (onNewData) onNewData(serverItems);
            }
          }).catch(e => console.warn("Background list sync failed", e));
        }

        return cachedItems;
      }
    } catch (e) {
      // Ignore cache read failures 
    }

    // 3. Cache Miss: We MUST wait for the network, but use a tighter timeout
    try {
      const serverSnapshot = await withTimeout(getDocsFromServer(q), 5000, "Server timeout");
      return serverSnapshot.docs.map(d => ({ 
        id: d.id, ...d.data(), syncPending: d.metadata.hasPendingWrites
      }));
    } catch (e) {
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
