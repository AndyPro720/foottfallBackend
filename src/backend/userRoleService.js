import { db, auth } from './firebaseConfig';
import { doc, getDoc, setDoc, getDocs, collection, query, orderBy, serverTimestamp, updateDoc } from 'firebase/firestore';

/**
 * Ensures a user document exists in Firestore and returns the user's role.
 * Defaults to 'agent' for new users.
 */
export async function syncUserProfile(user) {
  if (!user) return null;

  const userDocRef = doc(db, 'users', user.uid);
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
    // Update last login (non-blocking)
    setDoc(userDocRef, { lastLogin: serverTimestamp() }, { merge: true });
    return userSnap.data();
  }
}

/**
 * Fetches the document of the current user
 */
export async function getCurrentUserProfile() {
  const user = auth.currentUser;
  if (!user) return null;
  
  const userDocRef = doc(db, 'users', user.uid);
  const userSnap = await getDoc(userDocRef);
  return userSnap.exists() ? userSnap.data() : null;
}

/**
 * Fetches the role of the current user
 */
export async function getCurrentUserRole() {
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

