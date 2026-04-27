import { db, auth } from './firebaseConfig';
import { doc, getDoc, getDocFromCache, setDoc, getDocs, collection, query, orderBy, serverTimestamp, updateDoc, writeBatch, deleteDoc, where, limit } from 'firebase/firestore';

let profileCache = null;
let profileCacheUid = '';
let profileCacheAt = 0;
const PROFILE_CACHE_TTL_MS = 60 * 1000;
const LAST_LOGIN_THROTTLE_MS = 30 * 60 * 1000;

export function resetCurrentUserProfileCache() {
  profileCache = null;
  profileCacheUid = '';
  profileCacheAt = 0;
}

function shouldRefreshLastLogin(uid) {
  if (!uid) return false;
  try {
    const key = `ff:lastLoginSync:${uid}`;
    const previous = Number(localStorage.getItem(key) || '0');
    const now = Date.now();
    if (Number.isFinite(previous) && previous > 0 && (now - previous) < LAST_LOGIN_THROTTLE_MS) {
      return false;
    }
    localStorage.setItem(key, String(now));
    return true;
  } catch {
    return true;
  }
}

/**
 * Ensures a user document exists in Firestore and returns the user's role.
 * Defaults to 'agent' for new users.
 */
export async function syncUserProfile(user) {
  if (!user) return null;

  const userDocRef = doc(db, 'users', user.uid);

  // Background non-blocking update for lastLogin
  const updateLastLogin = async () => {
    if (!shouldRefreshLastLogin(user.uid)) return;
    try {
      await setDoc(userDocRef, { lastLogin: serverTimestamp() }, { merge: true });
    } catch (e) {
      // Ignore offline failures for this background task
    }
  };

  // Try instant cache retrieval first
  try {
    const cacheSnap = await getDocFromCache(userDocRef);
    if (cacheSnap.exists()) {
      updateLastLogin();
      return cacheSnap.data();
    }
  } catch (e) {
    // Cache miss or error, fallback to server silently
  }

  // Fallback to server if cache is empty
  try {
    const userSnap = await getDoc(userDocRef);
    
    if (!userSnap.exists()) {
      let role = 'agent';
      let status = 'pending';

      // Bootstrap superadmin
      if (user.email === 'trancidence@gmail.com') {
        const q = query(collection(db, 'users'), where('role', '==', 'superadmin'), limit(1));
        const superadminSnap = await getDocs(q);
        if (superadminSnap.empty) {
          role = 'superadmin';
          status = 'active';
        }
      }

      let inviteRef = null;
      let hasInvite = false;

      // Check for pre-approval invite. The invite is consumed only after the
      // user profile is created so security rules can verify the invite exists.
      if (status === 'pending' && user.email) {
        try {
          // Normalizing email to lowercase to match invite IDs safely
          inviteRef = doc(db, 'invites', user.email.toLowerCase());
          const inviteSnap = await getDoc(inviteRef);
          if (inviteSnap.exists()) {
            status = 'active';
            hasInvite = true;
          }
        } catch(e) {
          console.warn("Could not check invites", e);
        }
      }

      const userData = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || '',
        role: role,
        status: status,
        createdAt: serverTimestamp(),
        lastLogin: serverTimestamp()
      };
      await setDoc(userDocRef, userData);
      if (hasInvite && inviteRef) {
        try {
          await deleteDoc(inviteRef); // Consume the invite after profile creation
        } catch (e) {
          console.warn("Could not consume invite", e);
        }
      }
      return userData;
    } else {
      updateLastLogin();
      return userSnap.data();
    }
  } catch (e) {
    console.warn("Could not sync user profile from server.", e);
    // Safe fallback so the app doesn't crash or sign user out when offline
    return { uid: user.uid, email: user.email, displayName: user.displayName, role: 'agent', status: 'pending' };
  }
}

/**
 * Fetches the document of the current user, prioritizing fast offline cache.
 */
export async function getCurrentUserProfile(options = {}) {
  const { forceServer = false } = options;
  const user = auth.currentUser;
  if (!user) return null;

  const now = Date.now();
  if (
    !forceServer &&
    profileCache &&
    profileCacheUid === user.uid &&
    (now - profileCacheAt) < PROFILE_CACHE_TTL_MS
  ) {
    return profileCache;
  }
  
  const userDocRef = doc(db, 'users', user.uid);
  
  if (!forceServer) {
    try {
      // Try instant cache retrieval first
      const cacheSnap = await getDocFromCache(userDocRef);
      if (cacheSnap.exists()) {
        // NOTE: Security rules must enforce access control on the backend.
        // Caching roles locally is for UX rendering speed only.
        profileCache = cacheSnap.data();
        profileCacheUid = user.uid;
        profileCacheAt = now;
        return profileCache;
      }
    } catch (e) {
      // Cache miss or error, fallback to server silently
    }
  }

  // Fallback to server if cache is empty
  try {
    const userSnap = await getDoc(userDocRef);
    if (!userSnap.exists()) return null;
    profileCache = userSnap.data();
    profileCacheUid = user.uid;
    profileCacheAt = Date.now();
    return profileCache;
  } catch (e) {
    console.warn("Could not fetch user profile from server.", e);
    if (forceServer) {
      try {
        const cacheSnap = await getDocFromCache(userDocRef);
        if (cacheSnap.exists()) {
          profileCache = cacheSnap.data();
          profileCacheUid = user.uid;
          profileCacheAt = Date.now();
          return profileCache;
        }
      } catch (cacheErr) {
        // Ignore cache fallback errors when forced server fetch fails
      }
    }
    // Safe fallback so the app doesn't crash completely offline for returning users with cleared cache
    profileCache = { uid: user.uid, role: 'agent', status: 'pending' };
    profileCacheUid = user.uid;
    profileCacheAt = Date.now();
    return profileCache;
  }
}

/**
 * Fetches the role of the current user
 */
export async function getCurrentUserRole() {
  if (typeof window !== 'undefined' && window.userProfile?.uid === auth.currentUser?.uid) {
    return window.userProfile.role || 'agent';
  }
  const profile = await getCurrentUserProfile();
  return profile ? profile.role : 'agent';
}

/**
 * Admin: Get all users
 */
export async function getAllUsers() {
  try {
    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error('Error fetching users:', err);
    throw err;
  }
}

/**
 * Admin: Update user status
 */
export async function updateUserStatus(uid, status) {
  const userRef = doc(db, 'users', uid);
  return updateDoc(userRef, { status, updatedAt: serverTimestamp() });
}

/**
 * Superadmin: Transfer superadmin ownership
 */
export async function transferSuperadmin(targetUid) {
  const currentUid = auth.currentUser?.uid;
  if (!currentUid) throw new Error("Unauthenticated");
  
  const batch = writeBatch(db);
  batch.update(doc(db, 'users', targetUid), { role: 'superadmin', updatedAt: serverTimestamp() });
  batch.update(doc(db, 'users', currentUid), { role: 'admin', updatedAt: serverTimestamp() });
  return batch.commit();
}

/**
 * Superadmin: Remove a user completely
 */
export async function removeUser(uid) {
  return deleteDoc(doc(db, 'users', uid));
}

/**
 * Superadmin: Create an invite (pre-approve email)
 */
export async function createInvite(email) {
  if (!email) return;
  const inviteRef = doc(db, 'invites', email.toLowerCase());
  return setDoc(inviteRef, {
    email: email.toLowerCase(),
    createdAt: serverTimestamp(),
    createdBy: auth.currentUser?.uid || 'unknown'
  });
}

/**
 * Admin: Update user role
 */
export async function updateUserRole(uid, role) {
  const userRef = doc(db, 'users', uid);
  return updateDoc(userRef, { role, updatedAt: serverTimestamp() });
}
