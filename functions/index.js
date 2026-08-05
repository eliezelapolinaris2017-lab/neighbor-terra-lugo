const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

initializeApp();

const COMMUNITY_PATH = 'apps/neighbor/communities/terra-lugo';
const ALLOWED_ROLES = ['resident', 'guard', 'board', 'maintenance', 'viewer', 'admin'];

async function requireActiveAdmin(uid) {
  if (!uid) throw new HttpsError('unauthenticated', 'Debes iniciar sesión.');
  const db = getFirestore();
  const callerSnap = await db.doc(`${COMMUNITY_PATH}/users/${uid}`).get();
  const caller = callerSnap.data();
  if (!caller || caller.role !== 'admin' || caller.status !== 'active') {
    throw new HttpsError('permission-denied', 'Solo un administrador activo puede realizar esta acción.');
  }
  return { db, caller };
}

exports.createNeighborUser = onCall({ region: 'us-east1' }, async (request) => {
  const { db } = await requireActiveAdmin(request.auth?.uid);
  const data = request.data || {};
  const name = String(data.name || '').trim();
  const email = String(data.email || '').trim().toLowerCase();
  const homeId = String(data.homeId || '').trim().toUpperCase();
  const phone = String(data.phone || '').trim();
  const role = ALLOWED_ROLES.includes(data.role) ? data.role : 'resident';

  if (!name || !email) throw new HttpsError('invalid-argument', 'Nombre y correo son requeridos.');

  let authUser;
  try {
    authUser = await getAuth().createUser({ email, displayName: name, emailVerified: false, disabled: false });
  } catch (error) {
    if (error.code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists', 'Ese correo ya tiene una cuenta de acceso.');
    }
    throw new HttpsError('internal', error.message || 'No se pudo crear el usuario.');
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
    batch.update(residentQuery.docs[0].ref, {
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

exports.updateNeighborUserAccess = onCall({ region: 'us-east1' }, async (request) => {
  const { db } = await requireActiveAdmin(request.auth?.uid);
  const data = request.data || {};
  const targetUid = String(data.uid || '').trim();
  const role = ALLOWED_ROLES.includes(data.role) ? data.role : 'resident';
  const status = ['active', 'inactive', 'pending'].includes(data.status) ? data.status : 'active';

  if (!targetUid) throw new HttpsError('invalid-argument', 'El usuario es requerido.');

  const targetRef = db.doc(`${COMMUNITY_PATH}/users/${targetUid}`);
  const targetSnap = await targetRef.get();
  if (!targetSnap.exists) throw new HttpsError('not-found', 'No se encontró el usuario.');

  const target = targetSnap.data();
  if (target.role === 'admin' && (role !== 'admin' || status === 'inactive')) {
    const activeAdmins = await db.collection(`${COMMUNITY_PATH}/users`)
      .where('role', '==', 'admin')
      .where('status', '==', 'active')
      .get();
    if (activeAdmins.size <= 1) {
      throw new HttpsError('failed-precondition', 'Debe permanecer al menos un administrador activo.');
    }
  }

  await getAuth().updateUser(targetUid, { disabled: status === 'inactive' });
  await targetRef.update({
    role,
    status,
    updatedBy: request.auth.uid,
    updatedAt: FieldValue.serverTimestamp()
  });

  await db.collection(`${COMMUNITY_PATH}/activity`).add({
    type: 'access-updated',
    icon: '🔐',
    title: 'Acceso actualizado',
    detail: `${target.name || target.email} · ${role} · ${status}`,
    targetUserId: targetUid,
    userId: request.auth.uid,
    communityId: 'terra-lugo',
    createdAt: FieldValue.serverTimestamp()
  });

  return { uid: targetUid, role, status };
});
