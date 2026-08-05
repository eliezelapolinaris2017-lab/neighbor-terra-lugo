import { firebaseConfig, COMMUNITY_ID, APP_NAMESPACE } from './firebase-config.js';

let auth = null;
let db = null;
let firebaseReady = false;

const appRoot = () => ['apps', APP_NAMESPACE, 'communities', COMMUNITY_ID];

export async function initializeNeighborFirebase() {
  try {
    const appModule = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js');
    const authModule = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js');
    const firestoreModule = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');

    const app = appModule.initializeApp(firebaseConfig);
    auth = authModule.getAuth(app);
    db = firestoreModule.getFirestore(app);
    firebaseReady = true;

    return { ready: true, authModule, firestoreModule };
  } catch (error) {
    console.error('No se pudo iniciar Firebase:', error);
    return { ready: false, reason: 'initialization-error', error };
  }
}

export function isFirebaseReady() {
  return firebaseReady;
}

export async function signInNeighbor(email, password) {
  if (!auth) throw new Error('Firebase no está configurado.');
  const { signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js');
  const credential = await signInWithEmailAndPassword(auth, email, password);
  const profile = await ensureUserProfile(credential.user);
  return { user: credential.user, profile };
}

export async function signOutNeighbor() {
  if (!auth) return;
  const { signOut } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js');
  await signOut(auth);
}

export async function getUserProfile(uid) {
  if (!db) return null;
  const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
  const snapshot = await getDoc(doc(db, ...appRoot(), 'users', uid));
  return snapshot.exists() ? snapshot.data() : null;
}

async function ensureUserProfile(user) {
  const existing = await getUserProfile(user.uid);
  if (existing) return existing;

  const { doc, setDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
  const fallbackName = user.displayName || user.email?.split('@')[0] || 'Residente';
  const profile = {
    uid: user.uid,
    email: user.email || '',
    name: fallbackName,
    initials: fallbackName.slice(0, 2).toUpperCase(),
    role: 'resident',
    communityId: COMMUNITY_ID,
    status: 'pending',
    createdAt: serverTimestamp()
  };

  await setDoc(doc(db, ...appRoot(), 'users', user.uid), profile, { merge: true });
  return { ...profile, createdAt: null };
}

export async function saveCommunityActivity(item) {
  if (!db) return false;
  const { addDoc, collection, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
  await addDoc(collection(db, ...appRoot(), 'activity'), {
    ...item,
    communityId: COMMUNITY_ID,
    createdAt: serverTimestamp()
  });
  return true;
}
