const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

initializeApp();

const COMMUNITY_PATH = 'apps/neighbor/communities/terra-lugo';

exports.createNeighborUser = onCall({ region: 'us-east1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');

  const db = getFirestore();
  const callerRef = db.doc(`${COMMUNITY_PATH}/users/${request.auth.uid}`);
  const callerSnap = await callerRef.get();
  const caller = callerSnap.data();

  if (!caller || caller.role !== 'admin' || caller.status !== 'active') {
    throw new HttpsError('permission-denied', 'Solo un administrador activo puede crear usuarios.');
  }

  const data = request.data || {};
  const name = String(data.name || '').trim();
  const email = String(data.email || '').trim().toLowerCase();
  const homeId = String(data.homeId || '').trim().toUpperCase();
  const phone = String(data.phone || '').trim();
  const role = ['resident', 'guard', 'board', 'maintenance', 'viewer', 'admin'].includes(data.role)
    ? data.role
    : 'resident';

  if (!name || !email) throw new HttpsError('invalid-argument', 'Nombre y correo son requeridos.');

  let authUser;
  try {
    authUser = await getAuth().createUser({
      email,
      displayName: name,
      emailVerified: false,
      disabled: false
    });
  } catch (error) {
    if (error.code === 'auth/email-already-exists') {
      authUser = await getAuth().getUserByEmail(email);
    } else {
      throw new HttpsError('internal', error.message || 'No se pudo crear el usuario.');
    }
  }

  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const userRef = db.doc(`${COMMUNITY_PATH}/users/${authUser.uid}`);
  const residentQuery = await db.collection(`${COMMUNITY_PATH}/residents`).where('email', '==', email).limit(1).get();

  const batch = db.batch();
  batch.set(userRef, {
    uid: authUser.uid,
    name,
    initials,
    email,
    phone,
    homeId,
    role,
    status: 'active',
    communityId: 'terra-lugo',
    createdBy: request.auth.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  if (residentQuery.empty && role === 'resident') {
    const residentRef = db.collection(`${COMMUNITY_PATH}/residents`).doc();
    batch.set(residentRef, {
      name,
      email,
      phone,
      homeId,
      residentType: 'owner',
      status: 'active',
      userId: authUser.uid,
      createdBy: request.auth.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
  } else if (!residentQuery.empty) {
    const residentRef = residentQuery.docs[0].ref;
    batch.update(residentRef, {
      userId: authUser.uid,
      status: 'active',
      updatedBy: request.auth.uid,
      updatedAt: FieldValue.serverTimestamp()
    });
  }

  const activityRef = db.collection(`${COMMUNITY_PATH}/activity`).doc();
  batch.set(activityRef, {
    type: 'user-created',
    icon: '👤',
    title: 'Usuario creado',
    detail: `${name} · ${email}`,
    targetUserId: authUser.uid,
    userId: request.auth.uid,
    communityId: 'terra-lugo',
    createdAt: FieldValue.serverTimestamp()
  });

  await batch.commit();

  return { uid: authUser.uid, email, name, role, status: 'active' };
});
