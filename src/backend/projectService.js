import {
  collection, doc, getDoc, getDocs, updateDoc, deleteDoc, setDoc,
  query, where, serverTimestamp, getDocsFromCache, getDocsFromServer,
  getDocFromCache, getDocFromServer
} from "firebase/firestore";
import { db, auth } from "./firebaseConfig.js";
import { getCurrentUserRole } from "./userRoleService.js";

const PROJECTS_COLLECTION = "projects";

/** Race a promise against a timeout. */
function withTimeout(promise, ms, message = "Operation timed out") {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Creates a new project.
 * @param {Object} data The project data (project-level fields only).
 * @returns {Promise<string>} The created document ID.
 */
export async function createProject(data) {
  try {
    const docRef = doc(collection(db, PROJECTS_COLLECTION));
    const writeData = {
      ...data,
      unitCount: 0,
      createdBy: auth.currentUser?.uid || "system",
      creatorEmail: auth.currentUser?.email || "unknown",
      creatorName: auth.currentUser?.displayName || auth.currentUser?.email?.split('@')[0] || "unknown",
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    };
    await setDoc(docRef, writeData);
    return docRef.id;
  } catch (error) {
    console.error("Error creating project:", error);
    throw error;
  }
}

/**
 * Gets all projects, with cache-first strategy.
 * @param {Function} onNewData Optional callback fired if background sync finds updated data.
 * @returns {Promise<Array>} Array of project documents.
 */
export async function getProjects(onNewData = null) {
  try {
    let q = query(collection(db, PROJECTS_COLLECTION));

    // Role-based filtering: admins see all, agents see only their own
    const role = (typeof window !== "undefined" && window.userProfile?.role)
      ? window.userProfile.role
      : await getCurrentUserRole();
    if (role !== 'admin' && role !== 'superadmin') {
      const uid = auth.currentUser?.uid;
      if (uid) {
        q = query(q, where("createdBy", "==", uid));
      }
    }

    // 1. Try Cache First
    try {
      const cacheSnapshot = await getDocsFromCache(q);
      if (!cacheSnapshot.empty) {
        const cachedItems = cacheSnapshot.docs.map(d => ({
          id: d.id, ...d.data(), syncPending: d.metadata.hasPendingWrites
        }));

        // 2. Background Sync
        if (navigator.onLine && onNewData) {
          getDocsFromServer(q).then(serverSnapshot => {
            const serverItems = serverSnapshot.docs.map(d => ({
              id: d.id, ...d.data(), syncPending: d.metadata.hasPendingWrites
            }));
            const cachedIds = cachedItems.map(c => c.id).sort().join(',');
            const serverIds = serverItems.map(s => s.id).sort().join(',');
            if (cachedIds !== serverIds) {
              onNewData(serverItems);
            }
          }).catch(e => console.warn("Background project sync failed", e));
        }

        return cachedItems;
      }
    } catch (e) {
      // Ignore cache read failures
    }

    // 3. Cache Miss: server read with timeout
    try {
      const serverSnapshot = await withTimeout(getDocsFromServer(q), 5000, "Server timeout");
      return serverSnapshot.docs.map(d => ({
        id: d.id, ...d.data(), syncPending: d.metadata.hasPendingWrites
      }));
    } catch (e) {
      if (e.message === "Server timeout") return [];
      throw e;
    }
  } catch (error) {
    console.error("Error fetching projects:", error);
    throw error;
  }
}

/**
 * Gets a single project by ID, with cache-first strategy.
 * @param {string} id The document ID.
 * @returns {Promise<Object|null>} The project data or null if not found.
 */
export async function getProjectById(id) {
  try {
    const docRef = doc(db, PROJECTS_COLLECTION, id);

    // Try cache first
    try {
      const cacheSnap = await getDocFromCache(docRef);
      if (cacheSnap.exists()) {
        return { id: cacheSnap.id, ...cacheSnap.data() };
      }
    } catch (e) {
      // Cache miss
    }

    // Fallback to server
    const snap = await withTimeout(getDocFromServer(docRef), 5000, "Server read timeout");
    if (snap.exists()) {
      return { id: snap.id, ...snap.data() };
    }
    return null;
  } catch (error) {
    if (error.message === "Server read timeout") return null;
    console.error("Error getting project:", error);
    throw error;
  }
}

/**
 * Updates a project.
 * @param {string} id The document ID.
 * @param {Object} data The data to update.
 */
export async function updateProject(id, data) {
  try {
    const docRef = doc(db, PROJECTS_COLLECTION, id);
    await updateDoc(docRef, {
      ...data,
      updated_at: serverTimestamp(),
    });
  } catch (error) {
    console.error("Error updating project:", error);
    throw error;
  }
}

/**
 * Deletes a project. Does NOT cascade-delete units — caller should handle.
 * @param {string} id The document ID.
 */
export async function deleteProject(id) {
  try {
    const docRef = doc(db, PROJECTS_COLLECTION, id);
    await deleteDoc(docRef);
  } catch (error) {
    console.error("Error deleting project:", error);
    throw error;
  }
}

/**
 * Gets all inventory items belonging to a project.
 * @param {string} projectId The project document ID.
 * @returns {Promise<Array>} Array of inventory documents with this projectId.
 */
export async function getProjectUnits(projectId) {
  try {
    const q = query(
      collection(db, "inventory"),
      where("projectId", "==", projectId)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error("Error fetching project units:", error);
    throw error;
  }
}
