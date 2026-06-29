// script.js
import {
  ADMIN,
  ROOM_INFO,
  ensureAdminExists,
  loginWithFirestore,
  getUserById,
  getAllStudents,
  createStudent,
  updateStudent,
  deleteStudent,
  createTicket,
  getTicketsForStudent,
  getAllTickets,
  updateTicket
} from "./firebase.js";

// ================================
// Session Helpers
// ================================
function saveSession(user) {
  localStorage.setItem("hostelUser", JSON.stringify(user));
}

function getSession() {
  const raw = localStorage.getItem("hostelUser");
  return raw ? JSON.parse(raw) : null;
}

function clearSession() {
  localStorage.removeItem("hostelUser");
}

function formatMoney(value) {
  return `${Number(value).toLocaleString()} RWF`;
}

function statusBadge(status) {
  const s = (status || "").toLowerCase();

  if (s === "paid") return `<span class="badge paid">Paid</span>`;
  if (s === "pending") return `<span class="badge pending">Pending</span>`;
  if (s === "overdue") return `<span class="badge overdue">Overdue</span>`;
  if (s === "in progress") return `<span class="badge progress">In Progress</span>`;
  if (s === "resolved") return `<span class="badge paid">Resolved</span>`;
  return `<span class="badge pending">${status || "N/A"}</span>`;
}

function roomFee(roomType) {
  const type = (roomType || "").toLowerCase();
  if (type === "single") return ROOM_INFO.single.fee;
  if (type === "double") return ROOM_INFO.double.fee;
  if (type === "quadruple") return ROOM_INFO.quadruple.fee;
  return 0;
}

function roomLabel(roomType) {
  const type = (roomType || "").toLowerCase();
  if (type === "single") return ROOM_INFO.single.label;
  if (type === "double") return ROOM_INFO.double.label;
  if (type === "quadruple") return ROOM_INFO.quadruple.label;
  return roomType || "-";
}

// ================================
// Global Init
// ================================
document.addEventListener("DOMContentLoaded", async () => {
  try {
    await ensureAdminExists();
  } catch (err) {
    console.error("Admin initialization failed:", err);
  }

  setupLogoutButtons();
  setupLoginPage();
  setupStudentDashboard();
  setupAdminDashboard();
  setupContactForm();
});

// ================================
// Logout
// ================================
function setupLogoutButtons() {
  document.querySelectorAll(".logout-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      clearSession();
      window.location.href = "login.html";
    });
  });
}

// ================================
// Login Page
// ================================
function setupLoginPage() {
  const form = document.getElementById("loginForm");
  if (!form) return;

  const notice = document.getElementById("loginNotice");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value.trim();

    try {
      const user = await loginWithFirestore(email, password);

      if (!user) {
        notice.className = "notice error";
        notice.textContent = "Invalid email or password.";
        return;
      }

      saveSession(user);

      notice.className = "notice success";
      notice.textContent = "Login successful. Redirecting...";

      setTimeout(() => {
        if (user.role === "admin") {
          window.location.href = "admin-dashboard.html";
        } else {
          window.location.href = "student-dashboard.html";
        }
      }, 700);
    } catch (error) {
      notice.className = "notice error";
      notice.textContent = "Login failed. Please try again.";
      console.error(error);
    }
  });
}

// ================================
// Student Dashboard
// ================================
async function setupStudentDashboard() {
  const root = document.getElementById("studentDashboardPage");
  if (!root) return;

  const user = getSession();

  if (!user || user.role !== "student") {
    window.location.href = "login.html";
    return;
  }

  // fetch latest data from Firestore
  const latest = await getUserById(user.userId || user.id);
  if (!latest) {
    clearSession();
    window.location.href = "login.html";
    return;
  }

  saveSession(latest);

  // Profile section
  document.getElementById("studentName").textContent = latest.name || "-";
  document.getElementById("studentEmail").textContent = latest.email || "-";
  document.getElementById("studentRoom").textContent = roomLabel(latest.roomType);
  document.getElementById("studentFee").textContent = formatMoney(latest.monthlyFee || roomFee(latest.roomType));
  document.getElementById("studentPaymentStatus").innerHTML = statusBadge(latest.paymentStatus);
  document.getElementById("studentDueStatus").textContent = latest.dueStatus || "N/A";

  // Change password
  const passwordForm = document.getElementById("studentPasswordForm");
  const passwordNotice = document.getElementById("studentPasswordNotice");

  passwordForm?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const newPassword = document.getElementById("studentNewPassword").value.trim();
    if (newPassword.length < 4) {
      passwordNotice.className = "notice error";
      passwordNotice.textContent = "Password must be at least 4 characters.";
      return;
    }

    await updateStudent(latest.userId, { password: newPassword });
    passwordNotice.className = "notice success";
    passwordNotice.textContent = "Password updated successfully.";
    passwordForm.reset();
  });

  // Ticket create
  const ticketForm = document.getElementById("ticketForm");
  const ticketNotice = document.getElementById("ticketNotice");

  ticketForm?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const title = document.getElementById("ticketTitle").value.trim();
    const message = document.getElementById("ticketMessage").value.trim();

    if (!title || !message) {
      ticketNotice.className = "notice error";
      ticketNotice.textContent = "Please fill in all ticket fields.";
      return;
    }

    await createTicket({
      studentId: latest.userId,
      studentName: latest.name,
      title,
      message,
      status: "Pending",
      adminNote: ""
    });

    ticketNotice.className = "notice success";
    ticketNotice.textContent = "Ticket submitted successfully.";
    ticketForm.reset();
    await renderStudentTickets(latest.userId);
  });

  await renderStudentTickets(latest.userId);
}

async function renderStudentTickets(studentId) {
  const tableBody = document.getElementById("studentTicketsBody");
  if (!tableBody) return;

  const tickets = await getTicketsForStudent(studentId);

  if (!tickets.length) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="5">No tickets submitted yet.</td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = tickets.map(t => `
    <tr>
      <td>${t.title || "-"}</td>
      <td>${t.message || "-"}</td>
      <td>${statusBadge(t.status)}</td>
      <td>${t.adminNote || "-"}</td>
      <td>${t.createdAt?.toDate ? t.createdAt.toDate().toLocaleString() : "-"}</td>
    </tr>
  `).join("");
}

// ================================
// Admin Dashboard
// ================================
async function setupAdminDashboard() {
  const root = document.getElementById("adminDashboardPage");
  if (!root) return;

  const user = getSession();

  if (!user || user.role !== "admin") {
    window.location.href = "login.html";
    return;
  }

  await renderAdminStudents();
  await renderAdminTickets();
  await renderAdminStats();

  // Create student
  const form = document.getElementById("createStudentForm");
  const notice = document.getElementById("createStudentNotice");

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("studentCreateName").value.trim();
    const email = document.getElementById("studentCreateEmail").value.trim();
    const password = document.getElementById("studentCreatePassword").value.trim();
    const roomType = document.getElementById("studentCreateRoom").value;
    const paymentStatus = document.getElementById("studentCreatePayment").value;
    const dueStatus = document.getElementById("studentCreateDue").value;

    if (!name || !email || !password || !roomType || !paymentStatus || !dueStatus) {
      notice.className = "notice error";
      notice.textContent = "Please fill in all fields.";
      return;
    }

    await createStudent({
      name,
      email,
      password,
      roomType,
      monthlyFee: roomFee(roomType),
      paymentStatus,
      dueStatus
    });

    notice.className = "notice success";
    notice.textContent = "Student created successfully.";
    form.reset();

    await renderAdminStudents();
    await renderAdminStats();
  });
}

async function renderAdminStats() {
  const students = await getAllStudents();
  const tickets = await getAllTickets();

  const totalStudents = students.length;
  const paidCount = students.filter(s => (s.paymentStatus || "").toLowerCase() === "paid").length;
  const pendingCount = students.filter(s => (s.paymentStatus || "").toLowerCase() === "pending").length;
  const overdueCount = students.filter(s => (s.paymentStatus || "").toLowerCase() === "overdue").length;
  const ticketCount = tickets.length;

  const el1 = document.getElementById("statStudents");
  const el2 = document.getElementById("statPaid");
  const el3 = document.getElementById("statPending");
  const el4 = document.getElementById("statOverdue");
  const el5 = document.getElementById("statTickets");

  if (el1) el1.textContent = totalStudents;
  if (el2) el2.textContent = paidCount;
  if (el3) el3.textContent = pendingCount;
  if (el4) el4.textContent = overdueCount;
  if (el5) el5.textContent = ticketCount;
}

async function renderAdminStudents() {
  const tbody = document.getElementById("studentsTableBody");
  if (!tbody) return;

  const students = await getAllStudents();

  if (!students.length) {
    tbody.innerHTML = `
      <tr><td colspan="9">No students found.</td></tr>
    `;
    return;
  }

  tbody.innerHTML = students.map(student => `
    <tr>
      <td>${student.userId}</td>
      <td>${student.name}</td>
      <td>${student.email}</td>
      <td>${roomLabel(student.roomType)}</td>
      <td>${formatMoney(student.monthlyFee || roomFee(student.roomType))}</td>
      <td>${statusBadge(student.paymentStatus)}</td>
      <td>${student.dueStatus || "-"}</td>
      <td>${student.password || "-"}</td>
      <td>
        <div class="actions">
          <button class="btn warning edit-student-btn" data-id="${student.userId}">Edit</button>
          <button class="btn danger delete-student-btn" data-id="${student.userId}">Delete</button>
        </div>
      </td>
    </tr>
  `).join("");

  // Edit buttons
  document.querySelectorAll(".edit-student-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const current = students.find(s => s.userId === id);
      if (!current) return;

      const newName = prompt("Student name:", current.name || "");
      if (newName === null) return;

      const newRoom = prompt("Room type (single / double / quadruple):", current.roomType || "double");
      if (newRoom === null) return;

      const newPayment = prompt("Payment status (Paid / Pending / Overdue):", current.paymentStatus || "Pending");
      if (newPayment === null) return;

      const newDue = prompt("Due status (On Time / Late):", current.dueStatus || "On Time");
      if (newDue === null) return;

      const newPassword = prompt("New password (leave same if not changing):", current.password || "");
      if (newPassword === null) return;

      await updateStudent(id, {
        name: newName,
        roomType: newRoom.toLowerCase(),
        monthlyFee: roomFee(newRoom.toLowerCase()),
        paymentStatus: newPayment,
        dueStatus: newDue,
        password: newPassword
      });

      await renderAdminStudents();
      await renderAdminStats();
    });
  });

  // Delete buttons
  document.querySelectorAll(".delete-student-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const ok = confirm("Delete this student?");
      if (!ok) return;

      await deleteStudent(id);
      await renderAdminStudents();
      await renderAdminStats();
    });
  });
}

async function renderAdminTickets() {
  const tbody = document.getElementById("ticketsTableBody");
  if (!tbody) return;

  const tickets = await getAllTickets();

  if (!tickets.length) {
    tbody.innerHTML = `
      <tr><td colspan="7">No tickets found.</td></tr>
    `;
    return;
  }

  tbody.innerHTML = tickets.map(ticket => `
    <tr>
      <td>${ticket.studentName || "-"}</td>
      <td>${ticket.title || "-"}</td>
      <td>${ticket.message || "-"}</td>
      <td>${statusBadge(ticket.status)}</td>
      <td>${ticket.adminNote || "-"}</td>
      <td>${ticket.createdAt?.toDate ? ticket.createdAt.toDate().toLocaleString() : "-"}</td>
      <td>
        <div class="actions">
          <button class="btn warning edit-ticket-btn" data-id="${ticket.id}">Update</button>
        </div>
      </td>
    </tr>
  `).join("");

  document.querySelectorAll(".edit-ticket-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const current = tickets.find(t => t.id === id);
      if (!current) return;

      const newStatus = prompt("Ticket status (Pending / In Progress / Resolved):", current.status || "Pending");
      if (newStatus === null) return;

      const newNote = prompt("Admin note:", current.adminNote || "");
      if (newNote === null) return;

      await updateTicket(id, {
        status: newStatus,
        adminNote: newNote
      });

      await renderAdminTickets();
      await renderAdminStats();
    });
  });
}

// ================================
// Contact page
// ================================
function setupContactForm() {
  const form = document.getElementById("contactForm");
  if (!form) return;

  const notice = document.getElementById("contactNotice");

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    notice.className = "notice success";
    notice.textContent = "Message submitted successfully. We will contact you soon.";
    form.reset();
  });
}