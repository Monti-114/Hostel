const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

// Helper: verify caller is admin or superadmin
async function requireAdmin(context) {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Request had no auth.');
  const callerUid = context.auth.uid;
  const snap = await db.collection('users').doc(callerUid).get();
  if (!snap.exists) {
    // also allow lookup by studentId if doc id is studentId
    const q = await db.collection('users').where('uid','==',callerUid).limit(1).get();
    if (q.empty) throw new functions.https.HttpsError('permission-denied', 'Not authorized');
    const d = q.docs[0].data();
    if (!['admin','superadmin'].includes(d.role)) throw new functions.https.HttpsError('permission-denied', 'Not an admin');
    return d;
  }
  const profile = snap.data();
  if (!['admin','superadmin'].includes(profile.role)) throw new functions.https.HttpsError('permission-denied', 'Not an admin');
  return profile;
}

exports.createStudent = functions.https.onCall(async (data, context) => {
  await requireAdmin(context);
  const { studentId, fullName, email, password, phone='', gender='', roomType='', paymentStatus='Pending', dueDate=null, notes='', role='student' } = data;
  if (!studentId || !fullName || !email || !password) throw new functions.https.HttpsError('invalid-argument','Missing fields');

  try {
    const user = await admin.auth().createUser({ email, password, displayName: fullName });
    const uid = user.uid;
    const payload = {
      studentId, fullName, email, phone, gender, role: role === 'admin' ? 'admin' : 'student', uid,
      roomType, paymentStatus, dueDate: dueDate ? admin.firestore.Timestamp.fromDate(new Date(dueDate)) : null,
      notes, active:true, createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    await db.collection('users').doc(studentId).set(payload);
    // If creating admin, set custom claim
    if (role === 'admin') {
      await admin.auth().setCustomUserClaims(uid, { role: 'admin' });
    }
    await db.collection('activityLogs').add({ action:'Student Created', details:`${studentId} ${fullName}`, performedBy: context.auth.uid, timestamp: admin.firestore.FieldValue.serverTimestamp() });
    return { success: true, studentId };
  } catch (err) {
    throw new functions.https.HttpsError('internal', err.message);
  }
});

exports.deleteStudent = functions.https.onCall(async (data, context) => {
  await requireAdmin(context);
  const { studentId } = data;
  if (!studentId) throw new functions.https.HttpsError('invalid-argument','Missing studentId');

  try {
    const snap = await db.collection('users').doc(studentId).get();
    if (snap.exists) {
      const d = snap.data();
      if (d.uid) await admin.auth().deleteUser(d.uid);
      await db.collection('users').doc(studentId).delete();
    }
    await db.collection('activityLogs').add({ action:'Student Deleted', details:studentId, performedBy: context.auth.uid, timestamp: admin.firestore.FieldValue.serverTimestamp() });
    return { success:true };
  } catch (err) {
    throw new functions.https.HttpsError('internal', err.message);
  }
});

exports.resetStudentPassword = functions.https.onCall(async (data, context) => {
  await requireAdmin(context);
  const { studentId, newPassword } = data;
  if (!studentId || !newPassword) throw new functions.https.HttpsError('invalid-argument','Missing fields');
  try {
    const snap = await db.collection('users').doc(studentId).get();
    if (!snap.exists) throw new functions.https.HttpsError('not-found','Student not found');
    const d = snap.data();
    if (!d.uid) throw new functions.https.HttpsError('failed-precondition','No auth account');
    await admin.auth().updateUser(d.uid, { password: newPassword });
    await db.collection('activityLogs').add({ action:'Password Reset', details:`${studentId}`, performedBy: context.auth.uid, timestamp: admin.firestore.FieldValue.serverTimestamp() });
    return { success:true };
  } catch (err) { throw new functions.https.HttpsError('internal', err.message); }
});

exports.promoteToAdmin = functions.https.onCall(async (data, context) => {
  await requireAdmin(context);
  const { studentId } = data;
  if (!studentId) throw new functions.https.HttpsError('invalid-argument','Missing studentId');
  try {
    const snap = await db.collection('users').doc(studentId).get();
    if (!snap.exists) throw new functions.https.HttpsError('not-found','Student not found');
    const d = snap.data();
    if (!d.uid) throw new functions.https.HttpsError('failed-precondition','No auth account');
    await admin.auth().setCustomUserClaims(d.uid, { role: 'admin' });
    await db.collection('users').doc(studentId).update({ role:'admin' });
    await db.collection('activityLogs').add({ action:'Promoted to Admin', details:studentId, performedBy: context.auth.uid, timestamp: admin.firestore.FieldValue.serverTimestamp() });
    return { success:true };
  } catch (err) { throw new functions.https.HttpsError('internal', err.message); }
});

exports.updateStudent = functions.https.onCall(async (data, context) => {
  await requireAdmin(context);
  const { studentId, updates } = data;
  if (!studentId || !updates) throw new functions.https.HttpsError('invalid-argument','Missing fields');
  try {
    if (updates.email || updates.password || updates.fullName) {
      const snap = await db.collection('users').doc(studentId).get();
      if (snap.exists && snap.data().uid) {
        const uid = snap.data().uid;
        const authUpdates = {};
        if (updates.email) authUpdates.email = updates.email;
        if (updates.password) authUpdates.password = updates.password;
        if (updates.fullName) authUpdates.displayName = updates.fullName;
        if (Object.keys(authUpdates).length) await admin.auth().updateUser(uid, authUpdates);
      }
    }
    const payload = { ...updates };
    if (payload.dueDate) payload.dueDate = admin.firestore.Timestamp.fromDate(new Date(payload.dueDate));
    await db.collection('users').doc(studentId).update(payload);
    await db.collection('activityLogs').add({ action:'Student Updated', details:studentId, performedBy: context.auth.uid, timestamp: admin.firestore.FieldValue.serverTimestamp() });
    return { success:true };
  } catch (err) { throw new functions.https.HttpsError('internal', err.message); }
});
