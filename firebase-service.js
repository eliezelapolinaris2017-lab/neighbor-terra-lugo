import { firebaseConfig, COMMUNITY_ID, APP_NAMESPACE } from './firebase-config.js';

let auth = null;
let db = null;
let firebaseReady = false;
const appRoot = () => ['apps', APP_NAMESPACE, 'communities', COMMUNITY_ID];
const firestore = () => import('https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js');

export async function initializeNeighborFirebase() {
  try {
    const appModule = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js');
    const authModule = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js');
    const app = appModule.getApps().length ? appModule.getApp() : appModule.initializeApp(firebaseConfig);
    auth = authModule.getAuth(app);
    db = (await firestore()).getFirestore(app);
    firebaseReady = true;
    return { ready: true, authModule };
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
  let profile = await ensureUserProfile(credential.user);
  profile = await syncProfileWithResident(credential.user, profile);
  if (profile.status === 'inactive') {
    await signOutNeighbor();
    throw new Error('Tu acceso está desactivado. Comunícate con la administración.');
  }
  return { user: credential.user, profile };
}

export async function signOutNeighbor() {
  if (!auth) return;
  const { signOut } = await import('https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js');
  await signOut(auth);
}

export async function getUserProfile(uid) {
  if (!db) return null;
  const { doc, getDoc } = await firestore();
  const snapshot = await getDoc(doc(db, ...appRoot(), 'users', uid));
  return snapshot.exists() ? snapshot.data() : null;
}

async function ensureUserProfile(user) {
  const existing = await getUserProfile(user.uid);
  if (existing) return existing;
  const { doc, setDoc, serverTimestamp } = await firestore();
  const fallbackName = user.displayName || user.email?.split('@')[0] || 'Residente';
  const profile = {
    uid: user.uid,
    email: (user.email || '').trim().toLowerCase(),
    name: fallbackName,
    initials: fallbackName.slice(0, 2).toUpperCase(),
    role: 'resident',
    communityId: COMMUNITY_ID,
    status: 'active',
    createdAt: serverTimestamp()
  };
  await setDoc(doc(db, ...appRoot(), 'users', user.uid), profile, { merge: true });
  return { ...profile, createdAt: null };
}

async function syncProfileWithResident(user, profile) {
  const email = (user.email || profile.email || '').trim().toLowerCase();
  if (!db || !email) return profile;
  try {
    const { collection, doc, getDocs, limit, query, serverTimestamp, setDoc, where } = await firestore();
    const snapshot = await getDocs(query(collection(db, ...appRoot(), 'residents'), where('email', '==', email), limit(1)));
    if (snapshot.empty) return profile;

    const residentDoc = snapshot.docs[0];
    const resident = residentDoc.data();
    const name = String(resident.name || profile.name || email.split('@')[0]).trim();
    const linkedProfile = {
      ...profile,
      email,
      name,
      initials: name.slice(0, 2).toUpperCase(),
      homeId: String(resident.homeId || profile.homeId || '').trim().toUpperCase(),
      phone: String(resident.phone || profile.phone || '').trim(),
      residentType: resident.residentType || profile.residentType || 'resident',
      residentId: residentDoc.id,
      status: resident.status === 'inactive' ? 'inactive' : (profile.status || 'active'),
      syncedAt: serverTimestamp()
    };
    await setDoc(doc(db, ...appRoot(), 'users', user.uid), linkedProfile, { merge: true });
    return { ...linkedProfile, syncedAt: null };
  } catch (error) {
    console.warn('No se pudo enlazar el perfil con la ficha del residente:', error);
    return profile;
  }
}

export async function saveCommunityActivity(item) {
  if (!db) return false;
  const { addDoc, collection, serverTimestamp } = await firestore();
  await addDoc(collection(db, ...appRoot(), 'activity'), { ...item, communityId: COMMUNITY_ID, createdAt: serverTimestamp() });
  return true;
}

export async function listHomes() {
  if (!db) return [];
  const { collection, getDocs, orderBy, query } = await firestore();
  const snapshot = await getDocs(query(collection(db, ...appRoot(), 'homes'), orderBy('unit')));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function createHome(home) {
  requireUser('guardar');
  const { doc, setDoc, serverTimestamp } = await firestore();
  const unit = String(home.unit || '').trim().toUpperCase();
  if (!unit) throw new Error('La unidad es requerida.');
  await setDoc(doc(db, ...appRoot(), 'homes', unit), {
    unit,
    block: String(home.block || '').trim().toUpperCase(),
    number: String(home.number || '').trim(),
    ownerName: String(home.ownerName || '').trim(),
    status: home.status || 'active',
    balance: Number(home.balance || 0),
    createdBy: auth.currentUser.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return unit;
}

export async function updateHome(id, changes) {
  requireUser('editar');
  const { doc, updateDoc, serverTimestamp } = await firestore();
  await updateDoc(doc(db, ...appRoot(), 'homes', id), {
    ownerName: String(changes.ownerName || '').trim(),
    status: changes.status || 'active',
    balance: Number(changes.balance || 0),
    updatedBy: auth.currentUser.uid,
    updatedAt: serverTimestamp()
  });
}

export async function deleteHome(id) {
  requireUser('eliminar');
  const { deleteDoc, doc } = await firestore();
  await deleteDoc(doc(db, ...appRoot(), 'homes', id));
}

export async function listResidents() {
  if (!db) return [];
  const { collection, getDocs, orderBy, query } = await firestore();
  const snapshot = await getDocs(query(collection(db, ...appRoot(), 'residents'), orderBy('name')));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function createResident(resident) {
  requireUser('guardar');
  const { addDoc, collection, serverTimestamp } = await firestore();
  const name = String(resident.name || '').trim();
  if (!name) throw new Error('El nombre es requerido.');
  const reference = await addDoc(collection(db, ...appRoot(), 'residents'), normalizeResident(resident, {
    name,
    createdBy: auth.currentUser.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }));
  return reference.id;
}

export async function updateResident(id, changes) {
  requireUser('editar');
  const { doc, updateDoc, serverTimestamp } = await firestore();
  await updateDoc(doc(db, ...appRoot(), 'residents', id), normalizeResident(changes, {
    updatedBy: auth.currentUser.uid,
    updatedAt: serverTimestamp()
  }));
}

export async function deleteResident(id) {
  requireUser('eliminar');
  const { deleteDoc, doc } = await firestore();
  await deleteDoc(doc(db, ...appRoot(), 'residents', id));
}

export async function listVehicles() {
  if (!db) return [];
  const { collection, getDocs, orderBy, query } = await firestore();
  const snapshot = await getDocs(query(collection(db, ...appRoot(), 'vehicles'), orderBy('plate')));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function createVehicle(vehicle) {
  requireUser('guardar');
  const { doc, getDoc, setDoc, serverTimestamp } = await firestore();
  const plate = String(vehicle.plate || '').trim().toUpperCase();
  if (!plate) throw new Error('La tablilla es requerida.');
  const ref = doc(db, ...appRoot(), 'vehicles', plate);
  if ((await getDoc(ref)).exists()) throw new Error('Esa tablilla ya está registrada.');
  await setDoc(ref, normalizeVehicle(vehicle, { createdBy: auth.currentUser.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  return plate;
}

export async function updateVehicle(id, changes) {
  requireUser('editar');
  const { doc, updateDoc, serverTimestamp } = await firestore();
  await updateDoc(doc(db, ...appRoot(), 'vehicles', id), normalizeVehicle(changes, { updatedBy: auth.currentUser.uid, updatedAt: serverTimestamp() }));
}

export async function deleteVehicle(id) {
  requireUser('eliminar');
  const { deleteDoc, doc } = await firestore();
  await deleteDoc(doc(db, ...appRoot(), 'vehicles', id));
}

function normalizeResident(resident, audit = {}) {
  return {
    name: String(resident.name || '').trim(),
    homeId: String(resident.homeId || '').trim().toUpperCase(),
    email: String(resident.email || '').trim().toLowerCase(),
    phone: String(resident.phone || '').trim(),
    residentType: resident.residentType || 'owner',
    status: resident.status || 'active',
    emergencyContact: String(resident.emergencyContact || '').trim(),
    ...audit
  };
}

function normalizeVehicle(vehicle, audit = {}) {
  return {
    plate: String(vehicle.plate || '').trim().toUpperCase(),
    homeId: String(vehicle.homeId || '').trim().toUpperCase(),
    residentName: String(vehicle.residentName || '').trim(),
    make: String(vehicle.make || '').trim(),
    model: String(vehicle.model || '').trim(),
    year: Number(vehicle.year || 0) || null,
    color: String(vehicle.color || '').trim(),
    status: vehicle.status || 'active',
    ...audit
  };
}

function requireUser(action) {
  if (!db || !auth?.currentUser) throw new Error(`Inicia sesión para ${action} en Firebase.`);
}
