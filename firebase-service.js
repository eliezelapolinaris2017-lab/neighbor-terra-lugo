import { firebaseConfig, COMMUNITY_ID } from './firebase-config.js';

let auth = null;
let db = null;
let firebaseReady = false;

export async function initializeNeighborFirebase() {
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey === 'REEMPLAZAR') {
    return { ready: false, reason: 'missing-config' };
  }

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
  const profile = await getUserProfile(credential.user.uid);
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
  const snapshot = await getDoc(doc(db, 'communities', COMMUNITY_ID, 'users', uid));
  return snapshot.exists() ? snapshot.data() : null;
}

export async function saveCommunityActivity(item) {
  if (!db) return false;
  const { addDoc, collection, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
  await addDoc(collection(db, 'communities', COMMUNITY_ID, 'activity'), {
    ...item,
    createdAt: serverTimestamp()
  });
  return true;
}
