import {
    registerUser,
    loginUser,
    submitComplaint,
    db,
    ADMIN_ID,
    collection,
    onSnapshot,
    updateDoc,
    doc,
    addDoc
} from "./firebase.js";

let currentUser = null;
let adminStudentCount = 0;
let adminComplaintCounts = {
    New: 0,
    "In Progress": 0,
    Resolved: 0
};

const loginTab = document.getElementById("loginTab");
const registerTab = document.getElementById("registerTab");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");

/* ---------- Helpers ---------- */
function toast(msg) {
    const toastEl = document.getElementById("toast");
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => toastEl.classList.remove("show"), 2500);
}

function showPage(id) {
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    const target = document.getElementById(id);
    if (target) {
        target.classList.add("active");
    }
}
window.showPage = showPage;

function showAuthTab(tab) {
    if (tab === "login") {
        loginForm.classList.remove("hidden");
        registerForm.classList.add("hidden");
        loginTab.classList.add("active");
        registerTab.classList.remove("active");
    } else {
        registerForm.classList.remove("hidden");
        loginForm.classList.add("hidden");
        registerTab.classList.add("active");
        loginTab.classList.remove("active");
    }
}

loginTab.addEventListener("click", () => showAuthTab("login"));
registerTab.addEventListener("click", () => showAuthTab("register"));

function renderAdminAnalytics() {
    const analyticsEl = document.getElementById("roomAnalytics");
    if (!analyticsEl) return;

    const totalComplaints = adminComplaintCounts.New + adminComplaintCounts["In Progress"] + adminComplaintCounts.Resolved;

    analyticsEl.innerHTML = `
        <div class="card">
            <h3>System Overview</h3>
            <p>Total students: ${adminStudentCount}</p>
            <p>Total complaints: ${totalComplaints}</p>
            <p>New: ${adminComplaintCounts.New}</p>
            <p>In Progress: ${adminComplaintCounts["In Progress"]}</p>
            <p>Resolved: ${adminComplaintCounts.Resolved}</p>
        </div>
    `;
}

/* ---------- REGISTER ---------- */
document.getElementById("registerForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    try {
        const id = document.getElementById("regId").value.trim();
        const name = document.getElementById("regName").value.trim();
        const password = document.getElementById("regPassword").value;
        const confirm = document.getElementById("confirmPassword").value;
        const phone = document.getElementById("phone").value.trim();
        const gender = document.getElementById("gender").value;
        const floor = document.getElementById("floor").value;
        const room = document.getElementById("room").value.trim();

        if (!id || !name || !password || !phone || !gender || !floor || !room) {
            throw new Error("Fill all fields");
        }

        if (password !== confirm) {
            throw new Error("Passwords do not match");
        }

        const user = {
            id,
            name,
            password,
            phone,
            gender,
            floor,
            room,
            role: id === ADMIN_ID ? "admin" : "student",
            nickname: ""
        };

        await registerUser(user);
        toast("Registered successfully");
        registerForm.reset();

    } catch (err) {
        toast(err.message);
    }
});

/* ---------- LOGIN ---------- */
document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    try {
        const id = document.getElementById("loginId").value.trim();
        const password = document.getElementById("loginPassword").value;

        const user = await loginUser(id, password);

        currentUser = user;
        localStorage.setItem("session", JSON.stringify(user));

        loadDashboard();

    } catch (err) {
        toast(err.message);
    }
});

/* ---------- SESSION ---------- */
window.onload = () => {
    const session = localStorage.getItem("session");

    if (session) {
        currentUser = JSON.parse(session);
        loadDashboard();
    } else {
        showAuthTab("login");
    }
};

/* ---------- DASHBOARD ---------- */
function loadDashboard() {

    document.getElementById("authContainer").classList.add("hidden");
    document.getElementById("dashboardContainer").classList.remove("hidden");

    if (currentUser.role === "admin") {
        document.getElementById("adminBtn").classList.remove("hidden");
    }

    renderDashboard();
    renderProfile();
    listenComplaints();
    listenNews();

    if (currentUser.role === "admin") {
        loadAdminPanel();
    }
}

/* ---------- DASHBOARD UI ---------- */
function renderDashboard() {
    document.getElementById("dashboardCards").innerHTML = `
        <div class="card">
            <h3>${currentUser.name}</h3>
            <p>${currentUser.id}</p>
            <p>${currentUser.floor} - ${currentUser.room}</p>
        </div>
    `;
}

/* ---------- PROFILE ---------- */
window.updateProfile = async function () {

    const nickname = document.getElementById("nickname").value;

    await updateDoc(doc(db, "users", currentUser.id), {
        nickname
    });

    currentUser.nickname = nickname;
    localStorage.setItem("session", JSON.stringify(currentUser));

    toast("Profile updated");
};

function renderProfile() {
    document.getElementById("profileData").innerHTML = `
        <div class="card">
            <p><b>Name:</b> ${currentUser.name}</p>
            <p><b>ID:</b> ${currentUser.id}</p>
            <p><b>Phone:</b> ${currentUser.phone}</p>
            <p><b>Floor:</b> ${currentUser.floor}</p>
            <p><b>Room:</b> ${currentUser.room}</p>
            <p><b>Role:</b> ${currentUser.role}</p>
            <p><b>Nickname:</b> ${currentUser.nickname || "None"}</p>
        </div>
    `;
}

/* ---------- COMPLAINTS ---------- */
document.getElementById("complaintForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    try {
        const description = document.getElementById("complaintDesc").value.trim();

            const type = document.getElementById("complaintType").value;

        if (!type) {
            throw new Error("Please select an issue type");
        }

        if (!description) {
            throw new Error("Description required");
        }

        await submitComplaint({
            userId: currentUser.id,
            userName: currentUser.name,
            type,
            description,
            status: "New",
            createdAt: new Date().toISOString()
        });

        toast("Complaint sent");
        document.getElementById("complaintType").value = "";
        document.getElementById("complaintDesc").value = "";

    } catch (err) {
        toast(err.message);
    }
});

/* ---------- COMPLAINTS LIST ---------- */
function listenComplaints() {
    onSnapshot(collection(db, "complaints"), (snap) => {
        const container = document.getElementById("complaintsList");
        container.innerHTML = "";

        snap.forEach(d => {
            const c = d.data();

            if (currentUser.role === "admin" || c.userId === currentUser.id) {
                container.innerHTML += `
                    <div class="card">
                        <h4>${c.userName}</h4>
                        <p><b>Issue:</b> ${c.type || "General"}</p>
                        <p>${c.description}</p>
                        <p><b>Status:</b> ${c.status}</p>
                    </div>
                `;
            }
        });
    });
}

/* ---------- NEWS ---------- */
window.addNews = async function () {

    const title = document.getElementById("newsTitle").value;
    const message = document.getElementById("newsMessage").value;

    if (!title || !message) {
        return toast("Fill all fields");
    }

    await addDoc(collection(db, "news"), {
        title,
        message,
        createdAt: new Date().toISOString()
    });

    toast("News posted");
};

function listenNews() {
    onSnapshot(collection(db, "news"), (snap) => {
        const container = document.getElementById("announcementList");
        container.innerHTML = "";

        snap.forEach(d => {
            const n = d.data();

            container.innerHTML += `
                <div class="card">
                    <h3>${n.title}</h3>
                    <p>${n.message}</p>
                </div>
            `;
        });
    });
}

/* ---------- ADMIN ---------- */
function loadAdminPanel() {
    loadStudents();
    loadAdminComplaints();
    renderAdminAnalytics();
}

/* ---------- STUDENTS ---------- */
function loadStudents() {

    window.updateStudent = async function (id) {

        if (currentUser.role !== "admin") return;

        const name = prompt("Name:");
        const phone = prompt("Phone:");
        const password = prompt("Password:");
        const floor = prompt("Floor:");
        const room = prompt("Room:");

        if (!name || !phone || !password || !floor || !room) {
            return toast("Cancelled");
        }

        await updateDoc(doc(db, "users", id), {
            name,
            phone,
            password,
            floor,
            room
        });

        toast("Updated");
    };

window.toggleUserRole = async function (id, currentRole) {
    if (currentUser.role !== "admin") {
        return toast("Only admin can change user roles");
    }

    if (id === currentUser.id) {
        return toast("You cannot change your own admin role here");
    }

    const newRole = currentRole === "admin" ? "student" : "admin";

    await updateDoc(doc(db, "users", id), {
        role: newRole
    });

    toast(`Role updated to ${newRole}`);
};

    onSnapshot(collection(db, "users"), (snap) => {
        const container = document.getElementById("studentList");
        container.innerHTML = "";
        adminStudentCount = snap.size;

        snap.forEach(d => {
            const u = d.data();

            container.innerHTML += `
                <div class="card">
                    <p><b>${u.name}</b></p>
                    <p>${u.id}</p>
                    <p>${u.floor} - ${u.room}</p>
                    <p><b>Role:</b> ${u.role || "student"}</p>
                    <div class="student-actions">
                        <button onclick="updateStudent('${u.id}')">Edit</button>
                        <button onclick="toggleUserRole('${u.id}', '${u.role || "student"}')">
                            Set ${u.role === "admin" ? "Student" : "Admin"}
                        </button>
                    </div>
                </div>
            `;
        });

        renderAdminAnalytics();
    });
}

/* ---------- ADMIN COMPLAINTS ---------- */
function loadAdminComplaints() {
    const newContainer = document.getElementById("newComplaints");
    const progressContainer = document.getElementById("inProgressComplaints");
    const resolvedContainer = document.getElementById("resolvedComplaints");

    onSnapshot(collection(db, "complaints"), (snap) => {
        newContainer.innerHTML = "";
        progressContainer.innerHTML = "";
        resolvedContainer.innerHTML = "";

        adminComplaintCounts = {
            New: 0,
            "In Progress": 0,
            Resolved: 0
        };

        snap.forEach(d => {
            const c = d.data();
            const status = c.status || "New";

            const card = `
                <div class="card">
                    <h4>${c.userName}</h4>
                    <p><b>Issue:</b> ${c.type || "General"}</p>
                    <p>${c.description}</p>
                    <p><b>Status:</b> ${status}</p>
                    <select onchange="updateComplaintStatus('${d.id}', this.value)">
                        <option value="New" ${status === "New" ? "selected" : ""}>New</option>
                        <option value="In Progress" ${status === "In Progress" ? "selected" : ""}>In Progress</option>
                        <option value="Resolved" ${status === "Resolved" ? "selected" : ""}>Resolved</option>
                    </select>
                </div>
            `;

            if (status === "In Progress") {
                progressContainer.innerHTML += card;
                adminComplaintCounts["In Progress"]++;
            } else if (status === "Resolved") {
                resolvedContainer.innerHTML += card;
                adminComplaintCounts.Resolved++;
            } else {
                newContainer.innerHTML += card;
                adminComplaintCounts.New++;
            }
        });

        renderAdminAnalytics();
    });
}

window.updateComplaintStatus = async function (complaintId, newStatus) {
    if (currentUser.role !== "admin") {
        return toast("Only admin can update complaint status");
    }

    await updateDoc(doc(db, "complaints", complaintId), {
        status: newStatus
    });

    toast(`Complaint moved to ${newStatus}`);
};

/* ---------- LOGOUT ---------- */
document.getElementById("logoutBtn").addEventListener("click", () => {
    localStorage.removeItem("session");
    location.reload();
});