import { db, auth } from './firebaseConfig';
import { doc, getDoc, getDocFromCache, setDoc, getDocs, collection, query, orderBy, serverTimestamp, updateDoc } from 'firebase/firestore';

let profileCache = null;
let profileCacheUid = '';
let profileCacheAt = 0;
const PROFILE_CACHE_TTL_MS = 60 * 1000;

/**
 * Ensures a user document exists in Firestore and returns the user's role.
 * Defaults to 'agent' for new users.
 */
export async function syncUserProfile(user) {
  if (!user) return null;

  const userDocRef = doc(db, 'users', user.uid);

  // Background non-blocking update for lastLogin
  const updateLastLogin = async () => {
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
      const userData = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || '',
        role: 'agent', // Default role
        status: 'pending', // All new users start as pending
        createdAt: serverTimestamp(),
        lastLogin: serverTimestamp()
      };
      await setDoc(userDocRef, userData);
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
export async function getCurrentUserProfile() {
  const user = auth.currentUser;
  if (!user) return null;

  const now = Date.now();
  if (
    profileCache &&
    profileCacheUid === user.uid &&
    (now - profileCacheAt) < PROFILE_CACHE_TTL_MS
  ) {
    return profileCache;
  }
  
  const userDocRef = doc(db, 'users', user.uid);
  
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
 * Admin: Update user role
 */
export async function updateUserRole(uid, role) {
  const userRef = doc(db, 'users', uid);
  return updateDoc(userRef, { role, updatedAt: serverTimestamp() });
}
