import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getFirestore,
    doc,
    setDoc,
    getDoc,
    getDocs,
    updateDoc,
    addDoc,
    deleteDoc,
    collection,
    query,
    where,
    orderBy,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyC6hJ1o5sa7KBeESFSr9EfKmrVTcgLfNz8",
    authDomain: "hostel-c4b50.firebaseapp.com",
    projectId: "hostel-c4b50",
    storageBucket: "hostel-c4b50.firebasestorage.app",
    messagingSenderId: "620767695838",
    appId: "1:620767695838:web:9e13e2edcbe80b8fdb034f",
    measurementId: "G-SRCC1VSV5G"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const ADMIN_ID = "202511222";

export { db, ADMIN_ID, doc, setDoc, getDoc, getDocs, updateDoc, addDoc, deleteDoc, collection, query, where, orderBy, onSnapshot };

export async function registerUser(user) {
    const ref = doc(db, "users", user.id);
    const snap = await getDoc(ref);

    if (snap.exists()) {
        throw new Error("ID already exists");
    }

    await setDoc(ref, user);
}

export async function loginUser(id, password) {
    const ref = doc(db, "users", id);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
        throw new Error("User not found");
    }

    const user = snap.data();

    if (user.password !== password) {
        throw new Error("Wrong password");
    }

    return user;
}

export async function submitComplaint(data) {
    await addDoc(collection(db, "complaints"), data);
}
