import { 
  collection, doc, getDoc, getDocs, updateDoc, deleteDoc, setDoc,
  query, where, serverTimestamp, getDocsFromCache, getDocsFromServer 
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
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    };
    
    const setPromise = setDoc(docRef, writeData);
    
    // Non-blocking writes for better UX
    // If we're offline, return immediately (Firestore queues it in the background)
    if (!navigator.onLine) {
      return docRef.id;
    }
    
    // Otherwise wait for server acknowledgment, but only for 500ms for responsiveness
    try {
      await withTimeout(setPromise, 500, "TIMEOUT_QUEUED");
    } catch (e) {
      if (e.message !== "TIMEOUT_QUEUED") throw e;
      // If it timed out, it's still in the local queue, so it's "safe" to continue
    }
    
    return docRef.id;
  } catch (error) {
    console.error("Error adding inventory item:", error);
    throw error;
  }
}

/**
 * Gets a single inventory item by ID.
 * @param {string} id The document ID.
 * @returns {Promise<Object|null>} The document data or null if not found.
 */
export async function getInventoryItemById(id) {
  try {
    const docRef = doc(db, INVENTORY_COLLECTION, id);
    const docSnap = await withTimeout(getDoc(docRef), 8000);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() };
    } else {
      console.warn("No such document!");
      return null;
    }
  } catch (error) {
    console.error("Error getting inventory item:", error);
    throw error;
  }
}

/**
 * Gets inventory items, optionally filtered.
 * @param {Object} filters Key-value pairs matching Firestore fields (simple equality).
 * @returns {Promise<Array>} Array of inventory documents.
 */
export async function getInventoryItems(filters = {}) {
  try {
    let q = query(collection(db, INVENTORY_COLLECTION));

    // Role-based filtering: Only admins see everything. Regular users (agents) see only their own.
    const role = await getCurrentUserRole();
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

    // If specifically offline, don't even try the server
    if (!navigator.onLine) {
      const cacheSnapshot = await getDocsFromCache(q);
      return cacheSnapshot.docs.map(d => ({ 
        id: d.id, 
        ...d.data(),
        syncPending: d.metadata.hasPendingWrites
      }));
    }

    try {
      const querySnapshot = await withTimeout(
        getDocs(q),
        8000
      );
      return querySnapshot.docs.map(d => ({ 
        id: d.id, 
        ...d.data(),
        syncPending: d.metadata.hasPendingWrites
      }));
    } catch (err) {
      console.warn("Server query failed or timed out, falling back to cache:", err);
      const cacheSnapshot = await getDocsFromCache(q);
      return cacheSnapshot.docs.map(d => ({ 
        id: d.id, 
        ...d.data(),
        syncPending: d.metadata.hasPendingWrites
      }));
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
    const updatePromise = updateDoc(docRef, {
      ...data,
      updated_at: serverTimestamp(),
    });
    
    if (!navigator.onLine) return;
    
    try {
      await withTimeout(updatePromise, 3000, "TIMEOUT_QUEUED");
    } catch (e) {
      if (e.message !== "TIMEOUT_QUEUED") throw e;
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
