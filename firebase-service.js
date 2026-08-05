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

export function isFirebaseReady() { return firebaseReady; }

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
  const profile = { uid:user.uid, email:user.email || '', name:fallbackName, initials:fallbackName.slice(0,2).toUpperCase(), role:'resident', communityId:COMMUNITY_ID, status:'pending', createdAt:serverTimestamp() };
  await setDoc(doc(db, ...appRoot(), 'users', user.uid), profile, { merge:true });
  return { ...profile, createdAt:null };
}

export async function saveCommunityActivity(item) {
  if (!db) return false;
  const { addDoc, collection, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
  await addDoc(collection(db, ...appRoot(), 'activity'), { ...item, communityId:COMMUNITY_ID, createdAt:serverTimestamp() });
  return true;
}

export async function listHomes() {
  if (!db) return [];
  const { collection, getDocs, orderBy, query } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
  const snapshot = await getDocs(query(collection(db, ...appRoot(), 'homes'), orderBy('unit')));
  return snapshot.docs.map((item) => ({ id:item.id, ...item.data() }));
}

export async function createHome(home) {
  if (!db || !auth?.currentUser) throw new Error('Inicia sesión para guardar en Firebase.');
  const { doc, setDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
  const unit = String(home.unit || '').trim().toUpperCase();
  if (!unit) throw new Error('La unidad es requerida.');
  await setDoc(doc(db, ...appRoot(), 'homes', unit), { unit, block:String(home.block || '').trim().toUpperCase(), number:String(home.number || '').trim(), ownerName:String(home.ownerName || '').trim(), status:home.status || 'active', balance:Number(home.balance || 0), createdBy:auth.currentUser.uid, createdAt:serverTimestamp(), updatedAt:serverTimestamp() });
  return unit;
}

export async function updateHome(id, changes) {
  if (!db || !auth?.currentUser) throw new Error('Inicia sesión para editar en Firebase.');
  const { doc, updateDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
  await updateDoc(doc(db, ...appRoot(), 'homes', id), { ownerName:String(changes.ownerName || '').trim(), status:changes.status || 'active', balance:Number(changes.balance || 0), updatedBy:auth.currentUser.uid, updatedAt:serverTimestamp() });
}

export async function deleteHome(id) {
  if (!db || !auth?.currentUser) throw new Error('Inicia sesión para eliminar en Firebase.');
  const { deleteDoc, doc } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
  await deleteDoc(doc(db, ...appRoot(), 'homes', id));
}

export async function listResidents() {
  if (!db) return [];
  const { collection, getDocs, orderBy, query } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
  const snapshot = await getDocs(query(collection(db, ...appRoot(), 'residents'), orderBy('name')));
  return snapshot.docs.map((item) => ({ id:item.id, ...item.data() }));
}

export async function createResident(resident) {
  if (!db || !auth?.currentUser) throw new Error('Inicia sesión para guardar en Firebase.');
  const { addDoc, collection, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
  const name = String(resident.name || '').trim();
  if (!name) throw new Error('El nombre es requerido.');
  const reference = await addDoc(collection(db, ...appRoot(), 'residents'), {
    name,
    homeId:String(resident.homeId || '').trim().toUpperCase(),
    email:String(resident.email || '').trim().toLowerCase(),
    phone:String(resident.phone || '').trim(),
    residentType:resident.residentType || 'owner',
    status:resident.status || 'active',
    emergencyContact:String(resident.emergencyContact || '').trim(),
    createdBy:auth.currentUser.uid,
    createdAt:serverTimestamp(),
    updatedAt:serverTimestamp()
  });
  return reference.id;
}

export async function updateResident(id, changes) {
  if (!db || !auth?.currentUser) throw new Error('Inicia sesión para editar en Firebase.');
  const { doc, updateDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
  await updateDoc(doc(db, ...appRoot(), 'residents', id), {
    name:String(changes.name || '').trim(),
    homeId:String(changes.homeId || '').trim().toUpperCase(),
    email:String(changes.email || '').trim().toLowerCase(),
    phone:String(changes.phone || '').trim(),
    residentType:changes.residentType || 'owner',
    status:changes.status || 'active',
    emergencyContact:String(changes.emergencyContact || '').trim(),
    updatedBy:auth.currentUser.uid,
    updatedAt:serverTimestamp()
  });
}

export async function deleteResident(id) {
  if (!db || !auth?.currentUser) throw new Error('Inicia sesión para eliminar en Firebase.');
  const { deleteDoc, doc } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');
  await deleteDoc(doc(db, ...appRoot(), 'residents', id));
}
