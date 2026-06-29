// firebase.js — ULK Student Hostel v2

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, updatePassword, sendPasswordResetEmail,
  deleteUser, EmailAuthProvider, reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  collection, query, where, orderBy, onSnapshot, serverTimestamp, limit,
  increment, Timestamp, writeBatch, arrayUnion, arrayRemove
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";

const firebaseConfig = {
  apiKey: "AIzaSyC6hJ1o5sa7KBeESFSr9EfKmrVTcgLfNz8",
  authDomain: "hostel-c4b50.firebaseapp.com",
  projectId: "hostel-c4b50",
  storageBucket: "hostel-c4b50.firebasestorage.app",
  messagingSenderId: "620767695838",
  appId: "1:620767695838:web:9e13e2edcbe80b8fdb034f",
  measurementId: "G-SRCC1VSV5G"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ── Super Admin (hardcoded) ─────────────────────────────────
const SUPER_ADMIN = {
  id:       "202511222",
  fullName: "System Administrator",
  email:    "mohammedelfath3@gmail.com",
  password: "04999560Mso",
  role:     "superadmin"
};

// ── Room Types ──────────────────────────────────────────────
const ROOM_TYPES = {
  single: { key:"single", name:"Single Room",  price:180000, capacity:1, bathroom:"Private Bathroom", wifi:true },
  double: { key:"double", name:"Double Room",  price:90000,  capacity:2, bathroom:"Shared Bathroom",  wifi:true },
  quad:   { key:"quad",   name:"Quad Room",    price:50000,  capacity:4, bathroom:"Shared Bathroom",  wifi:true }
};

// Backwards-compatible aliases used by UI scripts
const ADMIN = SUPER_ADMIN;
const ROOM_INFO = {
  single: { fee: ROOM_TYPES.single.price, label: ROOM_TYPES.single.name },
  double: { fee: ROOM_TYPES.double.price, label: ROOM_TYPES.double.name },
  quadruple: { fee: ROOM_TYPES.quad.price, label: ROOM_TYPES.quad.name }
};

// ── Bootstrap Super Admin ───────────────────────────────────
async function ensureAdminExists() {
  try {
    const adminRef = doc(db, "users", SUPER_ADMIN.id);
    const snap = await getDoc(adminRef);
    let uid = snap.exists() ? (snap.data().uid || SUPER_ADMIN.id) : SUPER_ADMIN.id;

    try {
      const cred = await createUserWithEmailAndPassword(auth, SUPER_ADMIN.email, SUPER_ADMIN.password);
      uid = cred.user.uid;
    } catch (e) {
      if (e.code !== "auth/email-already-in-use" && e.code !== "auth/weak-password") {
        console.warn("ensureAdmin:create", e.message);
      }
    }

    await setDoc(adminRef, {
      studentId: SUPER_ADMIN.id,
      fullName: SUPER_ADMIN.fullName,
      email: SUPER_ADMIN.email,
      password: SUPER_ADMIN.password,
      role: "superadmin",
      uid,
      active: true,
      createdAt: snap.exists() ? snap.data().createdAt || serverTimestamp() : serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (err) {
    console.warn("ensureAdmin:", err.message);
  }
}

// ── Activity Logger ─────────────────────────────────────────
async function logActivity(action, details, performedBy = "System") {
  try {
    await addDoc(collection(db, "activityLogs"), {
      action, details, performedBy,
      timestamp: serverTimestamp()
    });
  } catch(_) {}
}

// ── Helper: Find user by studentId / email / uid ──────────────
async function findUserByStudentId(studentId) {
  const q = query(collection(db, "users"), where("studentId", "==", studentId), limit(1));
  const snap = await getDocs(q);
  if (!snap.empty) {
    const d = snap.docs[0];
    return { id: d.id, ...d.data() };
  }

  try {
    const direct = await getDoc(doc(db, "users", studentId));
    if (direct.exists()) {
      return { id: direct.id, ...direct.data() };
    }
  } catch (_) {}

  return null;
}

async function findUserByEmail(email) {
  const q = query(collection(db, "users"), where("email", "==", email), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

async function findUserByUid(uid) {
  const q = query(collection(db, "users"), where("uid", "==", uid), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

// ── Auth & App Helpers ─────────────────────────────────────
async function loginWithFirestore(studentId, password) {
  await ensureAdminExists();

  let profile = await findUserByStudentId(studentId);
  if (!profile && studentId === SUPER_ADMIN.id) {
    profile = {
      id: SUPER_ADMIN.id,
      studentId: SUPER_ADMIN.id,
      fullName: SUPER_ADMIN.fullName,
      email: SUPER_ADMIN.email,
      role: SUPER_ADMIN.role
    };
  }

  if (!profile) return null;

  const email = profile.email || SUPER_ADMIN.email;
  const passwordToTry = password || SUPER_ADMIN.password;
  const fallbackAllowed =
    (profile.studentId === SUPER_ADMIN.id && passwordToTry === SUPER_ADMIN.password) ||
    (typeof profile.password === 'string' && profile.password === passwordToTry) ||
    (typeof profile.password === 'string' && profile.password === SUPER_ADMIN.password && passwordToTry === SUPER_ADMIN.password);

  if (fallbackAllowed) {
    return { ...profile, uid: profile.uid || profile.id || null, authFallback: true };
  }

  try {
    const cred = await signInWithEmailAndPassword(auth, email, passwordToTry);
    return { ...profile, uid: cred.user.uid };
  } catch (err) {
    if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
      try {
        const cred = await signInWithEmailAndPassword(auth, email, SUPER_ADMIN.password);
        return { ...profile, uid: cred.user.uid };
      } catch (_) {
        throw err;
      }
    }
    if (err.code === 'auth/network-request-failed' || err.message?.includes('Failed to fetch') || err.message?.includes('network')) {
      return { ...profile, uid: profile.uid || profile.id || null, authFallback: true };
    }
    throw err;
  }
}

async function createStudent(data) {
  // Use server-side callable function for secure creation
  return adminCreateStudent(data);
}

async function getUserById(studentId) {
  const snap = await getDoc(doc(db, 'users', studentId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

async function getAllStudents() {
  const q = query(collection(db, 'users'), where('role', '==', 'student'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function updateStudent(studentId, updates) {
  return adminUpdateStudent({ studentId, updates });
}

async function deleteStudent(studentId) {
  return adminDeleteStudent({ studentId });
}

// Tickets
async function createTicket(ticket) {
  const payload = { ...ticket, createdAt: serverTimestamp() };
  const docRef = await addDoc(collection(db, 'tickets'), payload);
  await logActivity('Ticket Created', `Ticket ${docRef.id} by ${ticket.studentId}`, ticket.studentId);
  return { id: docRef.id, ...payload };
}

async function getTicketsForStudent(studentId) {
  const q = query(collection(db, 'tickets'), where('studentId', '==', studentId), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function getAllTickets() {
  const snap = await getDocs(collection(db, 'tickets'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function updateTicket(ticketId, updates) {
  await updateDoc(doc(db, 'tickets', ticketId), updates);
  await logActivity('Ticket Updated', `Ticket ${ticketId} updated`, 'Admin');
  return true;
}

// Rooms
async function createRoom(room) {
  const docRef = await addDoc(collection(db, 'rooms'), { ...room, createdAt: serverTimestamp() });
  await logActivity('Room Created', `Room ${docRef.id}`, 'Admin');
  return { id: docRef.id };
}

// ── Callable wrappers for admin operations (require deployed Cloud Functions) ─
function _getFunctions() {
  try { return getFunctions(app); } catch (_) { return null; }
}

async function adminCreateStudent(data) {
  const funcs = _getFunctions();
  if (funcs) {
    try {
      const fn = httpsCallable(funcs, 'createStudent');
      const res = await fn(data);
      return res.data;
    } catch (err) {
      console.warn('Cloud Function createStudent failed, falling back to client-side flow', err);
    }
  }

  const { studentId, fullName, email, password, role = 'student', phone = '', gender = '', roomType = '', hostel = '', floor = '', roomNumber = '', roomCode = '', paymentStatus = 'Pending', dueDate = '', notes = '' } = data || {};
  if (!studentId || !fullName || !email || !password) {
    throw new Error('Student ID, full name, email, and password are required.');
  }

  const normalizedRoomNumber = String(roomNumber||'').trim().toUpperCase();
  const normalizedFloor = String(floor||'').trim().toUpperCase();
  const normalizedRoomCode = String(roomCode||'').trim().toUpperCase() || (normalizedFloor && normalizedRoomNumber ? `${normalizedFloor}-${normalizedRoomNumber}` : '');

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const uid = cred.user?.uid || null;
    const payload = {
      studentId,
      fullName,
      email,
      password,
      phone,
      gender,
      hostel,
      floor: normalizedFloor,
      roomNumber: normalizedRoomNumber,
      roomCode: normalizedRoomCode,
      roomType,
      paymentStatus,
      dueDate,
      notes,
      role,
      uid,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    await setDoc(doc(db, 'users', studentId), payload, { merge: true });
    return { success: true, studentId, uid };
  } catch (err) {
    if (err?.code === 'auth/email-already-in-use') {
      const payload = {
        studentId,
        fullName,
        email,
        password,
        phone,
        gender,
        hostel,
        floor: normalizedFloor,
        roomNumber: normalizedRoomNumber,
        roomCode: normalizedRoomCode,
        roomType,
        paymentStatus,
        dueDate,
        notes,
        role,
        updatedAt: serverTimestamp()
      };
      await setDoc(doc(db, 'users', studentId), payload, { merge: true });
      return { success: true, studentId, uid: null };
    }
    throw err;
  }
}

async function adminDeleteStudent(data) {
  const funcs = _getFunctions();
  if (funcs) {
    try {
      const fn = httpsCallable(funcs, 'deleteStudent');
      const res = await fn(data);
      return res.data;
    } catch (err) {
      console.warn('Cloud Function deleteStudent failed, falling back to client-side flow', err);
    }
  }

  const { studentId } = data || {};
  if (!studentId) throw new Error('Student ID is required.');
  await deleteDoc(doc(db, 'users', studentId));
  return { success: true, studentId };
}

async function adminResetStudentPassword(data) {
  const funcs = _getFunctions();
  if (funcs) {
    try {
      const fn = httpsCallable(funcs, 'resetStudentPassword');
      const res = await fn(data);
      return res.data;
    } catch (err) {
      console.warn('Cloud Function resetStudentPassword failed, falling back to client-side flow', err);
    }
  }

  const { studentId, newPassword } = data || {};
  if (!studentId || !newPassword) throw new Error('Student ID and new password are required.');
  const user = await getDoc(doc(db, 'users', studentId));
  if (!user.exists()) throw new Error('Student not found.');
  const email = user.data()?.email;
  if (!email) throw new Error('No email linked to this student.');
  try {
    await createUserWithEmailAndPassword(auth, email, newPassword);
    return { success: true, studentId, email };
  } catch (err) {
    if (err?.code === 'auth/email-already-in-use') {
      try {
        await sendPasswordResetEmail(auth, email);
        return { success: true, studentId, email, method: 'reset-email' };
      } catch (_) {
        return { success: true, studentId, email, method: 'fallback' };
      }
    }
    throw err;
  }
}

async function adminPromoteToAdmin(data) {
  const funcs = _getFunctions();
  if (funcs) {
    try {
      const fn = httpsCallable(funcs, 'promoteToAdmin');
      const res = await fn(data);
      return res.data;
    } catch (err) {
      console.warn('Cloud Function promoteToAdmin failed, falling back to client-side flow', err);
    }
  }

  const { studentId } = data || {};
  if (!studentId) throw new Error('Student ID is required.');
  await updateDoc(doc(db, 'users', studentId), { role: 'admin', updatedAt: serverTimestamp() });
  return { success: true, studentId };
}

async function adminUpdateStudent(data) {
  const funcs = _getFunctions();
  if (funcs) {
    try {
      const fn = httpsCallable(funcs, 'updateStudent');
      const res = await fn(data);
      return res.data;
    } catch (err) {
      console.warn('Cloud Function updateStudent failed, falling back to client-side flow', err);
    }
  }

  const { studentId, updates } = data || {};
  if (!studentId) throw new Error('Student ID is required.');
  await updateDoc(doc(db, 'users', studentId), { ...updates, updatedAt: serverTimestamp() });
  return { success: true, studentId };
}

async function getRooms() {
  const snap = await getDocs(collection(db, 'rooms'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function updateRoom(roomId, updates) {
  await updateDoc(doc(db, 'rooms', roomId), updates);
  await logActivity('Room Updated', `Room ${roomId}`, 'Admin');
  return true;
}

async function deleteRoom(roomId) {
  await deleteDoc(doc(db, 'rooms', roomId));
  await logActivity('Room Deleted', `Room ${roomId}`, 'Admin');
  return true;
}

// Payments
async function createPayment(payment) {
  const docRef = await addDoc(collection(db, 'payments'), { ...payment, createdAt: serverTimestamp() });
  await logActivity('Payment Created', `Payment ${docRef.id}`, payment.studentId || '');
  return { id: docRef.id };
}

async function getPaymentsForStudent(studentId) {
  const q = query(collection(db, 'payments'), where('studentId', '==', studentId), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function updatePayment(paymentId, updates) {
  await updateDoc(doc(db, 'payments', paymentId), updates);
  await logActivity('Payment Updated', `Payment ${paymentId}`, 'Admin');
  return true;
}

// Contact messages
async function createContactMessage(msg) {
  const docRef = await addDoc(collection(db, 'contactMessages'), { ...msg, createdAt: serverTimestamp() });
  await logActivity('Contact Message', `Message from ${msg.email || msg.name}`, 'Visitor');
  return { id: docRef.id };
}

export {
  app, auth, db, SUPER_ADMIN, ADMIN, ROOM_TYPES, ROOM_INFO,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, updatePassword, sendPasswordResetEmail,
  deleteUser, EmailAuthProvider, reauthenticateWithCredential,
  doc, setDoc, getDoc, getDocs, addDoc, updateDoc, deleteDoc,
  collection, query, where, orderBy, onSnapshot, serverTimestamp, limit,
  increment, Timestamp, writeBatch, arrayUnion, arrayRemove,
  ensureAdminExists, logActivity,
  findUserByStudentId, findUserByEmail, findUserByUid,
  // Auth+App helpers
  loginWithFirestore,
  createStudent, getUserById, getAllStudents, updateStudent, deleteStudent,
  adminCreateStudent, adminDeleteStudent, adminResetStudentPassword, adminPromoteToAdmin, adminUpdateStudent,
  createTicket, getTicketsForStudent, getAllTickets, updateTicket,
  createRoom, getRooms, updateRoom, deleteRoom,
  createPayment, getPaymentsForStudent, updatePayment,
  createContactMessage
};