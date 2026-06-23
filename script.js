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
    addDoc,
    getDoc,
    deleteDoc,
    query,
    where,
    orderBy
} from "./firebase.js";

let currentUser = null;
let adminStudentCount = 0;
let adminComplaintCounts = {
    New: 0,
    "In Progress": 0,
    Resolved: 0
};

let activeChatRoomId = null;
let activeChatRoomTitle = "";
let activeForumTopicId = null;
let chatMessagesUnsubscribe = null;
let chatRoomsUnsubscribe = null;
let forumRepliesUnsubscribe = null;

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
    listenChatRooms();
    listenForumTopics();

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

function listenChatRooms() {
    const container = document.getElementById("chatRoomList");

    if (!container) return;

    if (chatRoomsUnsubscribe) {
        chatRoomsUnsubscribe();
    }

    chatRoomsUnsubscribe = onSnapshot(collection(db, "chatRooms"), (snap) => {
        container.innerHTML = "";

        snap.forEach(d => {
            const room = d.data();
            const isActive = d.id === activeChatRoomId;
            const deletedText = room.isDeleted ? " (deleted)" : "";

            container.innerHTML += `
                <div class="card">
                    <p><b>${room.name}${deletedText}</b></p>
                    <p>Created by: ${room.createdByName}</p>
                    <div class="student-actions">
                        <button onclick="setActiveChatRoom('${d.id}', '${room.name.replace(/'/g, "\\'")}', ${room.isDeleted ? 'true' : 'false'})">
                            ${isActive ? 'Joined' : 'Join'}
                        </button>
                        ${currentUser.role === 'admin' ? `<button onclick="deleteChatRoom('${d.id}')">Delete</button>` : ``}
                    </div>
                </div>
            `;
        });
    });
}

window.createChatRoom = async function () {
    const roomName = document.getElementById("chatRoomName").value.trim();

    if (!roomName) {
        return toast("Enter a group name");
    }

    await addDoc(collection(db, "chatRooms"), {
        name: roomName,
        createdBy: currentUser.id,
        createdByName: currentUser.name,
        createdAt: new Date().toISOString(),
        isDeleted: false
    });

    document.getElementById("chatRoomName").value = "";
    toast("Group created");
};

window.setActiveChatRoom = function (roomId, roomName) {
    if (activeChatRoomId === roomId) return;

    activeChatRoomId = roomId;
    activeChatRoomTitle = roomName;
    document.getElementById("activeChatRoomTitle").textContent = roomName;
    document.getElementById("leaveRoomBtn").classList.remove("hidden");
    document.getElementById("chatComposer").classList.remove("hidden");

    if (chatMessagesUnsubscribe) {
        chatMessagesUnsubscribe();
    }

    const messagesQuery = query(
        collection(db, "chatMessages"),
        where("roomId", "==", roomId),
        orderBy("createdAt")
    );

    chatMessagesUnsubscribe = onSnapshot(messagesQuery, (snap) => {
        const messagesEl = document.getElementById("chatMessages");
        messagesEl.innerHTML = "";

        snap.forEach(d => {
            const msg = d.data();
            const own = msg.userId === currentUser.id;
            const deleted = msg.isDeleted;
            const text = deleted ? "This message was deleted" : msg.text;

            messagesEl.innerHTML += `
                <div class="chat-message ${own ? 'own' : ''} ${deleted ? 'deleted' : ''}">
                    <div class="message-header">
                        <span><b>${msg.userName}</b></span>
                        <span>${new Date(msg.createdAt).toLocaleString()}</span>
                    </div>
                    <p>${text}</p>
                    <div class="message-actions">
                        ${(!deleted && own) ? `<button onclick="deleteChatMessage('${d.id}', '${msg.userId}')">Delete</button>` : ''}
                        ${currentUser.role === 'admin' ? `<button onclick="deleteChatMessage('${d.id}', '${msg.userId}')">Remove</button>` : ''}
                    </div>
                </div>
            `;
        });

        messagesEl.scrollTop = messagesEl.scrollHeight;
    });
};

window.sendChatMessage = async function () {
    if (!activeChatRoomId) {
        return toast("Select a group first");
    }

    const messageInput = document.getElementById("chatMessageInput");
    const text = messageInput.value.trim();

    if (!text) {
        return toast("Enter a message");
    }

    await addDoc(collection(db, "chatMessages"), {
        roomId: activeChatRoomId,
        userId: currentUser.id,
        userName: currentUser.name,
        text,
        createdAt: new Date().toISOString(),
        isDeleted: false
    });

    messageInput.value = "";
};

window.leaveChatRoom = function () {
    activeChatRoomId = null;
    activeChatRoomTitle = "";
    document.getElementById("activeChatRoomTitle").textContent = "Select a group to join";
    document.getElementById("leaveRoomBtn").classList.add("hidden");
    document.getElementById("chatComposer").classList.add("hidden");
    document.getElementById("chatMessages").innerHTML = "";

    if (chatMessagesUnsubscribe) {
        chatMessagesUnsubscribe();
        chatMessagesUnsubscribe = null;
    }
};

window.deleteChatRoom = async function (roomId) {
    if (currentUser.role !== "admin") {
        return toast("Only admin can delete rooms");
    }

    await deleteDoc(doc(db, "chatRooms", roomId));
    toast("Group deleted");
};

window.deleteChatMessage = async function (messageId, userId) {
    if (currentUser.role === "admin") {
        await deleteDoc(doc(db, "chatMessages", messageId));
        return toast("Message removed");
    }

    if (currentUser.id !== userId) {
        return toast("Only the sender can delete this message");
    }

    await updateDoc(doc(db, "chatMessages", messageId), {
        isDeleted: true,
        deletedBy: currentUser.id,
        deletedAt: new Date().toISOString()
    });

    toast("Message deleted");
};

function listenForumTopics() {
    const container = document.getElementById("forumTopicList");

    if (!container) return;

    onSnapshot(collection(db, "forumTopics"), (snap) => {
        container.innerHTML = "";

        snap.forEach(d => {
            const topic = d.data();
            const isOwner = topic.userId === currentUser.id;
            const deleted = topic.isDeleted;

            if (deleted && currentUser.role !== "admin" && !isOwner) return;

            const statusText = deleted ? " (deleted)" : "";

            container.innerHTML += `
                <div class="card">
                    <h4>${topic.title}${statusText}</h4>
                    <p>${topic.body.substring(0, 120)}${topic.body.length > 120 ? '...' : ''}</p>
                    <p class="meta">By ${topic.userName} • ${new Date(topic.createdAt).toLocaleString()}</p>
                    <div class="student-actions">
                        <button onclick="openForumTopicDetail('${d.id}')">
                            View
                        </button>
                        ${(!deleted && isOwner) ? `<button onclick="deleteForumTopic('${d.id}', '${topic.userId}')">Delete</button>` : ''}
                        ${currentUser.role === 'admin' ? `<button onclick="deleteForumTopic('${d.id}', '${topic.userId}')">Remove</button>` : ''}
                    </div>
                </div>
            `;
        });
    });
}

window.createForumTopic = async function () {
    const title = document.getElementById("forumTopicTitle").value.trim();
    const body = document.getElementById("forumTopicBody").value.trim();

    if (!title || !body) {
        return toast("Fill title and description");
    }

    await addDoc(collection(db, "forumTopics"), {
        title,
        body,
        userId: currentUser.id,
        userName: currentUser.name,
        createdAt: new Date().toISOString(),
        isDeleted: false
    });

    document.getElementById("forumTopicTitle").value = "";
    document.getElementById("forumTopicBody").value = "";
    toast("Discussion created");
};

window.openForumTopicDetail = async function (topicId) {
    activeForumTopicId = topicId;
    const topicDoc = await getDoc(doc(db, "forumTopics", topicId));

    if (!topicDoc.exists()) {
        return toast("Topic not found");
    }

    const topic = topicDoc.data();
    document.getElementById("forumTopicDetailTitle").textContent = topic.title;
    document.getElementById("forumTopicDetailBody").textContent = topic.body;
    document.getElementById("forumTopicDetailMeta").textContent = `By ${topic.userName} • ${new Date(topic.createdAt).toLocaleString()}`;
    document.getElementById("forumTopicDetail").classList.remove("hidden");

    if (forumRepliesUnsubscribe) {
        forumRepliesUnsubscribe();
    }

    const repliesQuery = query(
        collection(db, "forumReplies"),
        where("topicId", "==", topicId),
        orderBy("createdAt")
    );

    forumRepliesUnsubscribe = onSnapshot(repliesQuery, (snap) => {
        const repliesEl = document.getElementById("forumReplies");
        repliesEl.innerHTML = "";

        snap.forEach(d => {
            const reply = d.data();
            const isOwner = reply.userId === currentUser.id;
            const deleted = reply.isDeleted;
            const content = deleted ? "This reply was deleted" : reply.text;

            repliesEl.innerHTML += `
                <div class="card reply-card ${deleted ? 'deleted' : ''}">
                    <p>${content}</p>
                    <p class="meta">By ${reply.userName} • ${new Date(reply.createdAt).toLocaleString()}</p>
                    <div class="student-actions">
                        ${(!deleted && isOwner) ? `<button onclick="deleteForumReply('${d.id}', '${reply.userId}')">Delete</button>` : ''}
                        ${currentUser.role === 'admin' ? `<button onclick="deleteForumReply('${d.id}', '${reply.userId}')">Remove</button>` : ''}
                    </div>
                </div>
            `;
        });
    });
};

window.addForumReply = async function () {
    if (!activeForumTopicId) {
        return toast("Open a topic first");
    }

    const text = document.getElementById("forumReplyInput").value.trim();
    if (!text) {
        return toast("Write your reply");
    }

    await addDoc(collection(db, "forumReplies"), {
        topicId: activeForumTopicId,
        userId: currentUser.id,
        userName: currentUser.name,
        text,
        createdAt: new Date().toISOString(),
        isDeleted: false
    });

    document.getElementById("forumReplyInput").value = "";
};

window.closeForumTopicDetail = function () {
    activeForumTopicId = null;
    document.getElementById("forumTopicDetail").classList.add("hidden");
    document.getElementById("forumReplies").innerHTML = "";

    if (forumRepliesUnsubscribe) {
        forumRepliesUnsubscribe();
        forumRepliesUnsubscribe = null;
    }
};

window.deleteForumTopic = async function (topicId, userId) {
    if (currentUser.role === "admin") {
        await deleteDoc(doc(db, "forumTopics", topicId));
        toast("Topic removed");
        return;
    }

    if (currentUser.id !== userId) {
        return toast("Only the topic creator can delete this topic");
    }

    await updateDoc(doc(db, "forumTopics", topicId), {
        isDeleted: true,
        deletedBy: currentUser.id,
        deletedAt: new Date().toISOString()
    });

    toast("Topic deleted");
};

window.deleteForumReply = async function (replyId, userId) {
    if (currentUser.role === "admin") {
        await deleteDoc(doc(db, "forumReplies", replyId));
        toast("Reply removed");
        return;
    }

    if (currentUser.id !== userId) {
        return toast("Only the reply creator can delete this reply");
    }

    await updateDoc(doc(db, "forumReplies", replyId), {
        isDeleted: true,
        deletedBy: currentUser.id,
        deletedAt: new Date().toISOString()
    });

    toast("Reply deleted");
};

window.deleteNews = async function (newsId) {
    if (currentUser.role !== "admin") {
        return toast("Only admin can delete news");
    }

    await deleteDoc(doc(db, "news", newsId));
    toast("News removed");
};

function loadAdminPanel() {
    loadStudents();
    loadAdminComplaints();
    renderAdminAnalytics();
    renderNewsManagement();
    renderChatModeration();
    renderForumModeration();
}

function renderNewsManagement() {
    const container = document.getElementById("newsManagement");

    if (!container) return;

    onSnapshot(collection(db, "news"), (snap) => {
        container.innerHTML = "";

        snap.forEach(d => {
            const n = d.data();

            container.innerHTML += `
                <div class="card">
                    <h4>${n.title}</h4>
                    <p>${n.message}</p>
                    <button onclick="deleteNews('${d.id}')">Delete</button>
                </div>
            `;
        });
    });
}

function renderChatModeration() {
    const container = document.getElementById("chatModeration");

    if (!container) return;

    const messagesQuery = query(collection(db, "chatMessages"), orderBy("createdAt"));

    onSnapshot(messagesQuery, (snap) => {
        container.innerHTML = "";

        snap.forEach(d => {
            const msg = d.data();
            const deleted = msg.isDeleted;

            container.innerHTML += `
                <div class="card">
                    <p><b>${msg.userName}</b> in room ${msg.roomId}</p>
                    <p>${deleted ? 'DELETED: ' + (msg.text || '') : msg.text}</p>
                    <p class="meta">${new Date(msg.createdAt).toLocaleString()}</p>
                    <button onclick="deleteChatMessage('${d.id}', '${msg.userId}')">Remove</button>
                </div>
            `;
        });
    });
}

function renderForumModeration() {
    const container = document.getElementById("forumModeration");

    if (!container) return;

    onSnapshot(collection(db, "forumTopics"), (snap) => {
        container.innerHTML = "";

        snap.forEach(d => {
            const topic = d.data();
            const deleted = topic.isDeleted;

            container.innerHTML += `
                <div class="card">
                    <h4>${topic.title} ${deleted ? '(deleted)' : ''}</h4>
                    <p>${topic.body.substring(0, 120)}${topic.body.length > 120 ? '...' : ''}</p>
                    <p class="meta">By ${topic.userName} • ${new Date(topic.createdAt).toLocaleString()}</p>
                    <button onclick="deleteForumTopic('${d.id}', '${topic.userId}')">Remove</button>
                </div>
            `;
        });
    });
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
