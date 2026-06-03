const API = "";

const state = {
  view: localStorage.getItem("token") ? "dashboard" : "login",
  token: localStorage.getItem("token") || "",
  user: null,
  appointments: [],
  notifications: [],
  messages: [],
  adminAppointments: [],
  adminConversations: [],
  adminMessages: [],
  activePatientId: "",
  adminAppointmentFilter: "all",
  adminSearch: "",
  selectedAdminPatientId: "",
  doctorStatuses: {},
  queuePointer: Number(localStorage.getItem("queuePointer") || "0"),
  booking: {
    doctorId: "",
    service: "",
    date: "",
    time: "",
    notes: ""
  },
  bookingStep: 1,
  bookingConfirmOpen: false,
  lastBooked: null,
  registrationUser: null
};

const doctors = [
  { id: "doc-1", name: "Dr. Cindy Anticamara", specialty: "General Practice", clinic: "Clinic 1", status: "Free now" },
  { id: "doc-2", name: "Dr. Shin Nuel", specialty: "Dermatology", clinic: "Clinic 2", status: "Free now" },
  { id: "doc-3", name: "Dr. Earlyn Nasol", specialty: "Neurology", clinic: "Clinic 3", status: "In session" },
  { id: "doc-4", name: "Dr. Erich Ulan-Ulan", specialty: "Cardiology", clinic: "Clinic 3", status: "Unavailable" }
];

const services = [
  "General Consultation",
  "Annual Physical Exam",
  "Blood Test & Lab Work",
  "ECG & Heart Check",
  "X-Ray & Imaging",
  "Vaccination",
  "Prenatal Check",
  "Specialist Referral"
];

const slots = ["09:00", "10:00", "11:00", "14:00", "15:00"];
const app = document.querySelector("#app");

function html(strings, ...values) {
  return strings.reduce((out, part, index) => out + part + (values[index] ?? ""), "");
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

async function request(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(`${API}${path}`, { ...options, headers });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function toast(message) {
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 2800);
}

function modalDialog({ title, body, confirmText = "OK", cancelText = "", tone = "" }) {
  return new Promise(resolve => {
    const node = document.createElement("div");
    node.className = "modal-backdrop";
    node.innerHTML = html`
      <div class="modal-card ${tone}" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <h2 id="modalTitle">${escapeHtml(title)}</h2>
        <div class="modal-body">${body}</div>
        <div class="modal-actions">
          ${cancelText ? `<button class="btn secondary" data-modal-result="cancel" type="button">${escapeHtml(cancelText)}</button>` : ""}
          <button class="btn" data-modal-result="confirm" type="button">${escapeHtml(confirmText)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(node);
    const close = result => {
      node.remove();
      resolve(result);
    };
    node.addEventListener("click", event => {
      const action = event.target.closest("[data-modal-result]")?.dataset.modalResult;
      if (action) close(action === "confirm");
      if (event.target === node && cancelText) close(false);
    });
  });
}

function setView(view) {
  state.view = view;
  render();
}

function authShell(mode = "login") {
  const isRegister = mode === "register";
  app.innerHTML = html`
    <main class="auth-shell ${isRegister ? "register-mode" : ""}">
      ${isRegister ? "" : html`
        <section class="brand-panel">
          <div class="logo-row">
            <div class="logo-mark">⌘</div>
            <strong>MediTrack</strong>
          </div>
          <h1>Your health,<br>our priority.</h1>
          <p>Book appointments, monitor your queue position, and communicate with clinic staff - all in one place.</p>
          <div class="metric-grid">
            <div class="metric"><strong>12, 450+</strong><span>Registered Patients</span></div>
            <div class="metric"><strong>284</strong><span>Appointments Today</span></div>
            <div class="metric"><strong>18 min</strong><span>Average Wait Time</span></div>
            <div class="metric"><strong>98.2%</strong><span>Satisfaction Rate</span></div>
          </div>
        </section>
      `}
      <section class="auth-panel">
        <form class="auth-card ${isRegister ? "register-card" : ""}" id="${isRegister ? "registerForm" : "loginForm"}">
          ${isRegister ? `<div class="auth-icon">⌘</div>` : ""}
          <h2>${isRegister ? "Create an Account" : "Welcome back"}</h2>
          <p class="subtle">${isRegister ? "Join MediTrack - your health, simplified" : "Sign in to your MediTrack account"}</p>
          ${isRegister ? registerFields() : loginFields()}
          <div class="form-actions">
            <button class="btn" type="submit">${isRegister ? "Create Account" : "Sign In"}</button>
          </div>
          <p class="auth-switch">${isRegister ? "Already have an account?" : "No account yet?"}
            <button class="link-button" type="button" data-view="${isRegister ? "login" : "register"}">
              ${isRegister ? "Sign in" : "Register here"}
            </button>
          </p>
        </form>
      </section>
    </main>
  `;
}

function loginFields() {
  return html`
    <div class="form-grid">
      <label>Email Address <input name="email" type="email" autocomplete="username" placeholder="Enter your email" required></label>
      <label>Password <input name="password" type="password" autocomplete="current-password" placeholder="Enter your password" required></label>
    </div>
    <button class="link-button forgot-link" type="button">Forgot Password?</button>
  `;
}

function registerFields() {
  return html`
    <div class="form-grid two-col">
      <label>First Name <input name="firstName" autocomplete="given-name" required></label>
      <label>Last Name <input name="lastName" autocomplete="family-name" required></label>
    </div>
    <div class="form-grid">
      <label>Email Address <input name="email" type="email" autocomplete="email" placeholder="Enter your email" required></label>
    </div>
    <div class="form-grid two-col">
      <label>Phone Number <input name="phone" autocomplete="tel" required></label>
      <label>Date of Birth <input name="dob" type="date" required></label>
    </div>
    <div class="form-grid">
      <label>Password <input name="password" type="password" autocomplete="new-password" required></label>
      <label>Confirm Password <input name="confirmPassword" type="password" autocomplete="new-password" required></label>
    </div>
    <label class="terms-row"><input type="checkbox" required> <span>I agree to the Terms & Conditions and Policy Privacy</span></label>
  `;
}

async function loadData() {
  if (!state.token) return;
  const [me, doctorStatusData] = await Promise.all([
    request("/api/me"),
    request("/api/doctor-statuses")
  ]);
  state.user = me.user;
  state.doctorStatuses = doctorStatusData.doctorStatuses || {};
  if (state.user.role === "admin") {
    const [appointments, conversations, notifications] = await Promise.all([
      request("/api/admin/appointments"),
      request("/api/admin/conversations"),
      request("/api/notifications")
    ]);
    state.adminAppointments = appointments.appointments;
    state.adminConversations = conversations.conversations;
    state.notifications = notifications.notifications;
    if (!state.activePatientId && state.adminConversations.length) {
      state.activePatientId = state.adminConversations[0].id;
    }
    if (state.activePatientId) {
      const messages = await request(`/api/admin/messages?userId=${encodeURIComponent(state.activePatientId)}`);
      state.adminMessages = messages.messages;
    }
    return;
  }
  const [appointments, notifications, messages] = await Promise.all([
    request("/api/appointments"),
    request("/api/notifications"),
    request("/api/messages")
  ]);
  state.appointments = appointments.appointments;
  state.notifications = notifications.notifications;
  state.messages = messages.messages;
}

function shell(content) {
  const isAdmin = state.user?.role === "admin";
  app.innerHTML = html`
    <main class="app-shell ${isAdmin ? "admin-shell" : ""}">
      <aside class="sidebar">
        <div class="logo-row">
          <div class="logo-mark">⌘</div>
          <div><strong>MediTrack</strong><br><span class="subtle">Smart Clinic System</span></div>
        </div>
        <div class="user-row" style="margin-top: 26px">
          <div class="avatar">${initials(state.user?.name || "Airon Manlansing")}</div>
          <div><strong>${escapeHtml(state.user?.name || "Airon Manlansing")}</strong><br><span class="subtle">${isAdmin ? "Administrator" : "Patient"}</span></div>
        </div>
        <nav class="nav">
          ${isAdmin ? adminNav() : patientNav()}
        </nav>
        <button class="signout-btn" id="logoutBtn" type="button">⇱ <span>Sign out</span></button>
      </aside>
      <section class="main">${content}</section>
    </main>
  `;
}

function patientNav() {
  const unread = unreadNotificationCount();
  return [
    navButton("dashboard", navIcon("pulse"), "Dashboard"),
    navButton("appointments", navIcon("calendar"), "Book Appointment"),
    navButton("queue", navIcon("clock"), "Queue Monitor"),
    navButton("records", navIcon("book"), "My Record"),
    navButton("notifications", navIcon("bell"), "Notification", unread),
    navButton("chat", navIcon("chat"), "Chat Support")
  ].join("");
}

function adminNav() {
  const unread = unreadNotificationCount();
  return [
    navButton("adminDashboard", "D", "Dashboard"),
    navButton("adminAppointments", "A", "Appointments"),
    navButton("adminQueue", "Q", "Queue Monitor"),
    navButton("adminDoctors", "S", "Doctor Monitor"),
    navButton("adminRecords", "R", "Patients Record"),
    navButton("adminChat", "C", "Chat Support", unread)
  ].join("");
}

function initials(name) {
  return name.split(" ").map(part => part[0]).join("").slice(0, 2).toUpperCase();
}

function navButton(view, icon, label, badgeCount = 0) {
  const count = Number(badgeCount) || 0;
  return html`
    <button data-view="${view}" class="${state.view === view ? "active" : ""}" type="button">
      <span class="nav-icon">${icon}</span>
      <span class="nav-label">${escapeHtml(label)}</span>
      <span class="nav-badge" data-nav-badge="${view}" ${count ? "" : "hidden"}>${count}</span>
    </button>
  `;
}

function navIcon(name) {
  const icons = {
    pulse: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h4l2-5 4 11 2-6h6"/></svg>`,
    calendar: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v4M17 3v4M4 9h16M5 5h14v16H5zM8 13h2M12 13h2M16 13h2M8 17h2M12 17h2M16 17h2"/></svg>`,
    clock: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v6h5"/></svg>`,
    book: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h7a4 4 0 0 1 4 4v10a4 4 0 0 0-4-4H4zM20 5h-5a4 4 0 0 0-4 4v10a4 4 0 0 1 4-4h5z"/></svg>`,
    bell: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>`,
    chat: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v11H8l-4 4V5zM8 9h8M8 13h6"/></svg>`
  };
  return icons[name] || "";
}

function dashboard() {
  const pending = state.appointments.filter(item => item.status === "pending").length;
  const confirmed = state.appointments.filter(item => item.status === "confirmed").length;
  const completed = state.appointments.filter(item => item.status === "completed").length;
  shell(html`
    <div class="page-title dashboard-title">
      <div><h1>Good morning, ${escapeHtml((state.user?.name || "Airon").split(" ")[0])}</h1><p class="subtle">${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p></div>
      <button class="btn dashboard-book-btn" data-view="appointments">+ Booking Appointment</button>
    </div>
    <div class="grid dashboard-grid">
      ${dashboardStat("▣", "Upcoming", pending, "appointment")}
      ${dashboardStat("◷", "Queue Position", confirmed ? `#${state.appointments.find(item => item.status === "confirmed")?.queueNumber || "-"}` : "-", confirmed ? "now serving" : "no upcoming")}
      ${dashboardStat("✓", "Completed", completed, "All-time visit")}
      ${dashboardStat("▤", "Total Records", state.appointments.length, "in system")}
    </div>
    <div class="dashboard-columns">
      <section class="content-card appointments-card">
        <div class="panel-head"><h2>My Appointments</h2><button class="link-button" data-view="records" type="button">View All ></button></div>
        ${state.appointments.length ? appointmentTable(state.appointments.slice(0, 3)) : `<div class="empty compact"><p>No appointments yet.</p></div>`}
      </section>
      <aside class="dashboard-side">
        <section class="content-card quick-actions">
          <h2>Quick Actions</h2>
          <button data-view="appointments" type="button">▣ Book Appointment <span>></span></button>
          <button data-view="queue" type="button">◎ Track My Queue <span>></span></button>
          <button data-view="chat" type="button">✉ Message Staff <span>></span></button>
          <button data-view="records" type="button">▥ View Records <span>></span></button>
        </section>
        <section class="content-card patient-info-card">
          <h2>Patient Info</h2>
          ${infoRow("Patient ID", state.user?.patientId)}
          ${infoRow("Phone", state.user?.phone)}
          ${infoRow("Blood Type", state.user?.bloodType || "Unknown")}
          ${infoRow("Date of Birth", state.user?.dob)}
        </section>
      </aside>
    </div>
  `);
}

function dashboardStat(icon, label, value, hint) {
  return html`
    <div class="content-card stat">
      <span class="stat-icon">${icon}</span>
      <div><span class="subtle">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(hint)}</small></div>
    </div>
  `;
}

function appointments() {
  if (state.booking.doctorId && currentDoctorStatus(state.booking.doctorId) === "unavailable") {
    state.booking.doctorId = "";
  }
  const selectedDoctor = doctors.find(item => item.id === state.booking.doctorId);
  shell(html`
    <div class="booking-page">
      <div class="booking-head"><h1>Book an Appointment</h1><p class="subtle">Complete the steps below in under 2 minutes</p></div>
      ${bookingStepper()}
      <section class="booking-card">
        ${bookingStepContent(selectedDoctor)}
      </section>
    </div>
  `);
}

function bookingStepper() {
  const labels = ["Select Doctor", "Choose Service", "Pick Date & Time", "Confirm"];
  return html`
    <div class="booking-steps">
      ${labels.map((label, index) => html`
        <button class="${state.bookingStep === index + 1 ? "active" : ""} ${state.bookingStep > index + 1 ? "done" : ""}" data-booking-step="${index + 1}" type="button">
          <strong>${index + 1}</strong><span>${label}</span>
        </button>
      `).join("")}
    </div>
  `;
}

function bookingReady() {
  return Boolean(state.booking.doctorId && state.booking.service && state.booking.date && state.booking.time);
}

function bookingStepContent(selectedDoctor) {
  if (state.bookingStep === 2) {
    return html`
      <h2>Choose a Service</h2>
      <div class="service-grid">
        ${services.map(service => selectCard("service", service, service, "", "")).join("")}
      </div>
      ${bookingNav(Boolean(state.booking.service))}
    `;
  }
  if (state.bookingStep === 3) {
    return html`
      <h2>Select Date & Time</h2>
      <div class="date-time-grid">
        <label>Appointment Date <input id="bookingDate" type="date" min="${todayDate()}" value="${state.booking.date}"></label>
        <div class="slot-grid">${slots.map(slot => selectCard("time", slot, formatTime(slot), "", "")).join("")}</div>
      </div>
      <label class="notes-field">Additional Notes (optional)
        <textarea id="bookingNotes" placeholder="Describe your symptoms or concerns">${escapeHtml(state.booking.notes || "")}</textarea>
      </label>
      ${bookingNav(Boolean(state.booking.date && state.booking.time))}
    `;
  }
  if (state.bookingStep === 4) {
    return html`
      <h2>Confirm Appointment</h2>
      <div class="confirm-summary">
        <div class="doctor-summary"><span class="summary-icon">⌘</span><div><strong>${escapeHtml(selectedDoctor?.name || "-")}</strong><p class="subtle">${escapeHtml(selectedDoctor?.specialty || "")}</p></div></div>
        ${summaryLine("Service", state.booking.service)}
        ${summaryLine("Date", formatDate(state.booking.date))}
        ${summaryLine("Time", formatTime(state.booking.time))}
        ${summaryLine("Estimated Queue", "#13")}
      </div>
      <div class="booking-actions">
        <button class="link-button" data-booking-prev type="button">Back</button>
        <button class="btn confirm-btn" id="bookBtn" type="button">✓ Confirm Booking</button>
      </div>
    `;
  }
  return html`
    <div class="doctor-card-head">
      <h2>Select a Doctor</h2>
      <div class="legend"><span class="free"></span>Free <span class="session"></span>In Session <span class="busy"></span>Unavailable</div>
    </div>
    <label class="search-field"><input placeholder="Search by name or specialty"></label>
    <div class="doctor-grid">
      ${doctors.map(doctor => selectCard("doctor", doctor.id, doctor.name, `${doctor.specialty} · ${doctor.clinic}`, doctor.status)).join("")}
    </div>
    ${bookingNav(Boolean(state.booking.doctorId))}
  `;
}

function bookingNav(canContinue) {
  return html`
    <div class="booking-actions">
      ${state.bookingStep > 1 ? `<button class="link-button" data-booking-prev type="button">Back</button>` : `<span></span>`}
      <button class="btn" data-booking-next type="button" ${canContinue ? "" : "disabled"}>Continue ></button>
    </div>
  `;
}

function summaryLine(label, value) {
  return `<div class="summary-line"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "-")}</strong></div>`;
}

function selectCard(type, value, title, subtitle, meta) {
  const doctorStatus = type === "doctor" ? currentDoctorStatus(value) : "";
  const disabled = type === "doctor" && doctorStatus === "unavailable";
  const displayMeta = type === "doctor" ? doctorStatusLabel(doctorStatus) : meta;
  const selected = (type === "doctor" && state.booking.doctorId === value) ||
    (type === "service" && state.booking.service === value) ||
    (type === "time" && state.booking.time === value);
  return html`
    <button class="select-card ${type === "doctor" ? doctorStatus : ""} ${selected ? "selected" : ""}" data-select="${type}" data-value="${escapeHtml(value)}" type="button" ${disabled ? "disabled" : ""}>
      <strong>${escapeHtml(title)}</strong>
      <p class="subtle">${escapeHtml(subtitle)}</p>
      ${displayMeta ? `<span class="pill">${escapeHtml(displayMeta)}</span>` : ""}
    </button>
  `;
}

function queue() {
  const active = state.appointments.find(item => item.status === "confirmed");
  shell(html`
    <div class="page-title">
      <div>
        <h1>Queue Monitor</h1>
        <p class="subtle">${active ? "Your confirmed appointment is in the queue." : "No upcoming confirmed appointments"}</p>
      </div>
    </div>
    <div class="empty queue-empty patient-queue-empty">
      ${active ? html`
        <div>
          <div class="queue-icon">◷</div>
          <h2>Queue #${escapeHtml(active.queueNumber || "-")}</h2>
          <p>${escapeHtml(active.service)} with ${escapeHtml(active.doctorName)}</p>
          <p class="subtle">Estimated wait: ${escapeHtml(active.estimatedWait || 18)} minutes</p>
        </div>
      ` : html`
        <div>
          <div class="queue-icon">◷</div>
          <h2>No Active Queue</h2>
          <p>You have no confirmed appointment at the moment.</p>
        </div>
      `}
    </div>
  `);
}

function patientQueueItems() {
  return state.appointments
    .filter(item => ["pending", "confirmed", "completed"].includes(item.status))
    .slice()
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
}

function patientQueueTable(items, currentIndex) {
  if (!items.length) return `<div class="admin-empty"><p>No queue entries yet.</p></div>`;
  return html`
    <table class="admin-table">
      <thead><tr><th>Queue #</th><th>Patient</th><th>Doctor</th><th>Scheduled</th><th>Wait</th><th>Status</th></tr></thead>
      <tbody>
        ${items.map((item, index) => {
          const isDone = item.status === "completed" || index < currentIndex;
          const isCurrent = item.status === "confirmed" || index === currentIndex;
          return html`
            <tr>
              <td><strong class="queue-number">Q-${String(item.queueNumber || index + 1).padStart(3, "0")}</strong></td>
              <td>${escapeHtml(state.user?.name || "Patient")}</td>
              <td>${escapeHtml(item.doctorName)}</td>
              <td>${formatTime(item.time)}</td>
              <td>${isDone ? "0 min" : isCurrent ? "Now" : `~${Math.max(1, index - currentIndex) * (item.estimatedWait || 18)} min`}</td>
              <td><span class="admin-status ${isDone ? "confirmed" : isCurrent ? "session" : "pending"}">${isDone ? "Done" : isCurrent ? "In Progress" : "Waiting"}</span></td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

function bookingSuccess() {
  const item = state.lastBooked || {};
  shell(html`
    <section class="success-page">
      <div class="success-check">✓</div>
      <h1>Appointment Booked!</h1>
      <p>Your appointment with ${escapeHtml(item.doctorName || "your doctor")} on<br>${escapeHtml(formatDate(item.date || ""))} at ${escapeHtml(formatTime(item.time || "15:00"))} has been submitted for confirmation.</p>
      <div class="success-summary">
        ${summaryLine("Doctor", item.doctorName || "-")}
        ${summaryLine("Service", item.service || "-")}
        ${summaryLine("Date & Time", `${formatDate(item.date || "")} · ${item.time ? formatTime(item.time) : "-"}`)}
        ${summaryLine("Queue #", item.queueNumber ? `#${item.queueNumber}` : "#13")}
      </div>
      <div class="success-actions">
        <button class="btn secondary" data-view="dashboard" type="button">Back to Dashboard</button>
        <button class="btn" data-view="queue" type="button">◷ Track Queue</button>
      </div>
    </section>
  `);
}

function registrationSuccess() {
  app.innerHTML = html`
    <main class="registration-success">
      <div class="success-check">✓</div>
      <h1>Registration Successful!</h1>
      <p>Welcome to MediTrack, ${escapeHtml(state.registrationUser?.firstName || state.registrationUser?.name || "Patient")}! Redirecting to your dashboard...</p>
      <div class="progress-line"><span></span></div>
    </main>
  `;
}

function records() {
  shell(html`
    <div class="page-title records-title"><div><h1>Patients Records</h1><p class="subtle">ID: ${escapeHtml(state.user?.patientId)}</p></div></div>
    <div class="tabs">
      <button class="tab-button active" data-record-tab="history">Appointment History</button>
      <button class="tab-button" data-record-tab="profile">Profile Info</button>
    </div>
    <section class="content-card record-panel" id="recordPanel">
      ${recordHistory()}
    </section>
  `);
}

function recordHistory() {
  return html`<div class="panel-head"><h2>Appointment History</h2><button class="link-button" type="button">⚱ Filter</button></div>${appointmentTable(state.appointments)}`;
}

function profileInfo() {
  const user = state.user || {};
  return html`
    <div class="profile-head"><div class="profile-avatar">${initials(user.name || "Patient")}</div><div><h2>${escapeHtml(user.name)}</h2><p class="subtle">${escapeHtml(user.email)}</p><span class="pill">Registered Patient</span></div></div>
    <div class="profile-grid">
      ${infoRow("Patient ID", user.patientId)}
      ${infoRow("Phone Number", user.phone)}
      ${infoRow("Email Address", user.email)}
      ${infoRow("Date of Birth", user.dob)}
      ${infoRow("Blood Type", user.bloodType || "Unknown")}
      ${infoRow("Address", user.address || "-")}
      ${infoRow("Registered Since", "May 26, 2026")}
      ${infoRow("Account Status", "Active & Verified")}
    </div>
  `;
}

function infoRow(label, value) {
  return `<div class="info-row"><span>${escapeHtml(label)}</span>${escapeHtml(value || "-")}</div>`;
}

function appointmentTable(items) {
  if (!items.length) return `<div class="empty"><p>No appointments on record yet.</p></div>`;
  return html`
    <table class="table">
      <thead><tr><th>ID</th><th>Doctor</th><th>Service</th><th>Date</th><th>Time</th><th>Status</th></tr></thead>
      <tbody>
        ${items.map(item => html`
          <tr>
            <td>${escapeHtml(item.id)}</td>
            <td>${escapeHtml(item.doctorName)}</td>
            <td>${escapeHtml(item.service)}</td>
            <td>${formatDate(item.date)}</td>
            <td>${formatTime(item.time)}</td>
            <td><span class="pill ${item.status === "confirmed" ? "good" : "warn"}">${escapeHtml(item.status)}</span></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function notifications() {
  shell(html`
    <div class="page-title">
      <div><h1>Notifications</h1><p class="subtle">${state.notifications.filter(item => !item.read).length} unread messages</p></div>
      <button class="btn secondary" id="markReadBtn">Mark all read</button>
    </div>
    <div class="notification-list">
      ${state.notifications.map(item => html`
        <div class="notification-item">
          <div class="notification-check">✓</div>
          <div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.body)}</p><span class="subtle">${escapeHtml(item.createdAt)}</span></div>
          ${item.read ? "" : `<span class="unread-dot"></span>`}
        </div>
      `).join("")}
    </div>
  `);
}

function doctorMonitor() {
  shell(html`
    <div class="page-title">
      <div><h1>Doctor Monitor</h1><p class="subtle">View doctor availability before booking.</p></div>
      <button class="btn" data-view="appointments" type="button">Book Appointment</button>
    </div>
    <div class="doctor-monitor-grid patient-doctor-grid">
      ${doctorProfiles().map(doctor => html`
        <section class="admin-soft-card doctor-monitor-card">
          <div class="doctor-monitor-head">
            <span class="admin-avatar large">${initials(doctor.name.replace("Dr. ", ""))}</span>
            <div><h2>${escapeHtml(doctor.name)}</h2><p>${escapeHtml(doctor.specialty)}</p></div>
            ${doctorStatusBadge(currentDoctorStatus(doctor.id))}
          </div>
          <div class="doctor-meta">
            <p>Schedule: ${escapeHtml(doctor.schedule)}</p>
            <p>Rating: ${escapeHtml(doctor.rating)} - ${escapeHtml(doctor.patients)} patients today</p>
            <p>${escapeHtml(doctor.phone)}</p>
            <p>${escapeHtml(doctor.email)}</p>
          </div>
        </section>
      `).join("")}
    </div>
  `);
}

function chat() {
  shell(html`
    <div class="page-title"><div><h1>Chat Support</h1><p class="subtle">Message clinic staff about appointments and inquiries.</p></div></div>
    <div class="chat-card">
      <header class="chat-support-head">
        <div class="support-avatar">MQ</div>
        <div><h2>MediTrack Support</h2><p><span class="online-dot"></span> Online now</p></div>
      </header>
      <section class="chat-body">
        <p class="encryption-note">Messages are encrypted end-to-end</p>
        <div class="message-list" id="messageList">
          ${state.messages.map(messageBubble).join("")}
        </div>
        <form class="composer" id="messageForm">
          <input name="body" placeholder="Type your message..." required autocomplete="off">
          <button class="send-button" type="submit">▷</button>
        </form>
        <p class="response-note">Response time: usually within 5 minutes during clinic hours</p>
      </section>
    </div>
  `);
  const list = document.querySelector("#messageList");
  if (list) list.scrollTop = list.scrollHeight;
}

function messageBubble(message) {
  return html`
    <div class="bubble ${message.sender === "patient" ? "me" : ""}">
      <strong>${message.sender === "patient" ? "You" : "MediTrack Support"}</strong>
      <p>${escapeHtml(message.body)}</p>
      <span class="subtle">${escapeHtml(message.createdAt)}</span>
    </div>
  `;
}

function unreadNotificationCount() {
  return state.notifications.filter(item => !item.read).length;
}

function syncNotificationBadges() {
  const unread = unreadNotificationCount();
  const badgeViews = state.user?.role === "admin" ? ["adminChat"] : ["notifications"];
  badgeViews.forEach(view => {
    document.querySelectorAll(`[data-nav-badge="${view}"]`).forEach(badge => {
      badge.textContent = unread;
      badge.hidden = unread === 0;
    });
  });
  document.querySelectorAll(".admin-bell span").forEach(badge => {
    badge.textContent = unread;
    badge.hidden = unread === 0;
  });
}

function adminDashboard() {
  const counts = adminStatusCounts();
  const totalPatients = adminPatients().length;
  const completed = state.adminAppointments.filter(item => item.status === "confirmed").length;
  const unread = unreadNotificationCount();
  shell(html`
    <div class="admin-page-head">
      <div>
        <h1>Good morning, Admin</h1>
        <p>Here's what's happening today at MediTrack</p>
      </div>
      <button class="admin-bell" type="button" data-view="adminChat">!<span ${unread ? "" : "hidden"}>${unread}</span></button>
    </div>
    <div class="admin-feature-grid">
      ${adminFeatureCard("P", totalPatients || 1284, "Total Patients", "+12% this month", "pink")}
      ${adminFeatureCard("A", state.adminAppointments.length, "Appointments Today", `${counts.pending} pending approval`, "violet")}
      ${adminFeatureCard("T", "18 min", "Avg Wait Time", "-3 min vs yesterday", "blue")}
      ${adminFeatureCard("C", completed || 24, "Completed Today", "63% of scheduled", "green")}
    </div>
    <div class="admin-dashboard-panels">
      <section class="admin-soft-card">
        <h2>Recent Activity</h2>
        <div class="admin-activity">
          ${adminActivityRows().map(row => html`<div><span>${row.time}</span><p class="${row.tone}">${escapeHtml(row.title)}</p><small>${escapeHtml(row.detail)}</small></div>`).join("")}
        </div>
      </section>
      <section class="admin-soft-card">
        <h2>Staff on Duty</h2>
        <div class="staff-list">
          ${doctorProfiles().map(doctor => html`
            <div class="staff-row">
              <span class="admin-avatar">${initials(doctor.name.replace("Dr. ", ""))}</span>
              <div><strong>${escapeHtml(doctor.name)}</strong><small>${escapeHtml(doctor.specialty)}</small></div>
              ${doctorStatusBadge(currentDoctorStatus(doctor.id))}
            </div>
          `).join("")}
        </div>
      </section>
    </div>
    ${counts.pending ? html`
      <button class="admin-alert" data-view="adminAppointments" type="button">
        <strong>${counts.pending} appointments pending approval</strong>
        <span>Review and approve patient appointment requests in the Appointments section.</span>
      </button>
    ` : ""}
  `);
}

function adminFeatureCard(icon, value, label, hint, tone) {
  return html`
    <section class="admin-feature-card ${tone}">
      <span>${escapeHtml(icon)}</span>
      <strong>${escapeHtml(value)}</strong>
      <p>${escapeHtml(label)}</p>
      <small>${escapeHtml(hint)}</small>
    </section>
  `;
}

function adminActivityRows() {
  const recent = state.adminAppointments.slice(-5).reverse();
  if (!recent.length) {
    return [
      { time: "09:02 AM", title: "Appointment approved", detail: "Maria Santos -> Dr. Cindy Anticamara", tone: "good" },
      { time: "09:15 AM", title: "New appointment request", detail: "Jose Cruz -> Dr. Shin Nuel", tone: "warn" },
      { time: "09:30 AM", title: "Patient checked in", detail: "Ana Dela Cruz -> Dr. Earlyn Nasol", tone: "info" }
    ];
  }
  return recent.map((item, index) => ({
    time: `${String(9 + index).padStart(2, "0")}:0${index} AM`,
    title: adminStatusLabel(item.status),
    detail: `${item.patientName || "Patient"} -> ${item.doctorName}`,
    tone: item.status === "confirmed" ? "good" : item.status === "rejected" ? "danger" : "warn"
  }));
}

function adminAppointments() {
  const counts = adminStatusCounts();
  const visible = filteredAdminAppointments();
  shell(html`
    <div class="admin-page-head">
      <div>
        <h1>Appointment Approval</h1>
        <p>Review and manage patient appointment requests</p>
      </div>
    </div>
    <div class="admin-toolbar">
      <div class="admin-filter-group">
        ${adminFilterButton("all", "All", state.adminAppointments.length)}
        ${adminFilterButton("pending", "Pending", counts.pending)}
        ${adminFilterButton("confirmed", "Approved", counts.confirmed)}
        ${adminFilterButton("rejected", "Declined", counts.rejected)}
      </div>
      <label class="admin-search">
        <span>Search</span>
        <input id="adminAppointmentSearch" value="${escapeHtml(state.adminSearch)}" placeholder="Search patient or doctor..." aria-label="Search appointments">
      </label>
    </div>
    <div class="admin-card">
      ${adminAppointmentTable(visible)}
    </div>
  `);
}

function adminFilterButton(filter, label, count) {
  return `<button class="admin-filter ${state.adminAppointmentFilter === filter ? "active" : ""}" data-admin-filter="${filter}" type="button">${escapeHtml(label)} <span>${escapeHtml(count)}</span></button>`;
}

function filteredAdminAppointments() {
  const query = state.adminSearch.trim().toLowerCase();
  return state.adminAppointments.filter(item => {
    const matchesFilter = state.adminAppointmentFilter === "all" || item.status === state.adminAppointmentFilter;
    const haystack = `${item.patientName} ${item.doctorName} ${item.service} ${item.id}`.toLowerCase();
    return matchesFilter && (!query || haystack.includes(query));
  });
}

function adminStatusCounts() {
  return state.adminAppointments.reduce((totals, item) => {
    totals[item.status] = (totals[item.status] || 0) + 1;
    return totals;
  }, { pending: 0, confirmed: 0, rejected: 0 });
}

function adminStatCard(label, value, icon, tone) {
  return html`
    <section class="admin-stat ${tone}">
      <div class="admin-stat-icon">${escapeHtml(icon)}</div>
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(label)}</span>
    </section>
  `;
}

function doctorProfiles() {
  return [
    { id: "doc-1", name: "Dr. Cindy Anticamara", specialty: "General Practice", schedule: "Mon-Fri, 8AM-4PM", phone: "+63 917 100 0101", email: "c.anticamara@meditrack.ph", rating: "4.9", patients: 12 },
    { id: "doc-2", name: "Dr. Shin Nuel", specialty: "Dermatology", schedule: "Tue-Sat, 9AM-5PM", phone: "+63 917 100 0102", email: "s.nuel@meditrack.ph", rating: "4.7", patients: 18 },
    { id: "doc-3", name: "Dr. Earlyn Nasol", specialty: "Neurology", schedule: "Mon-Thu, 10AM-6PM", phone: "+63 917 100 0103", email: "e.nasol@meditrack.ph", rating: "4.8", patients: 9 },
    { id: "doc-4", name: "Dr. Erich Ulan-Ulan", specialty: "Cardiology", schedule: "Wed-Sun, 8AM-3PM", phone: "+63 917 100 0104", email: "e.ulan@meditrack.ph", rating: "4.6", patients: 7 }
  ];
}

function currentDoctorStatus(id) {
  return state.doctorStatuses[id] || (id === "doc-2" ? "session" : id === "doc-4" ? "unavailable" : "available");
}

function doctorStatusLabel(status) {
  if (status === "session") return "In session";
  if (status === "unavailable") return "Unavailable";
  return "Free now";
}

function doctorStatusBadge(status) {
  const label = status === "session" ? "On Session" : status === "unavailable" ? "Unavailable" : "Available";
  return `<span class="doctor-status ${status}"><i></i>${label}</span>`;
}

function adminAppointmentTable(items) {
  if (!items.length) return `<div class="admin-empty"><p>No appointment requests yet.</p></div>`;
  return html`
    <table class="admin-table">
      <thead><tr><th>Patient</th><th>Doctor</th><th>Date & Time</th><th>Reason</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>
        ${items.map(item => html`
          <tr>
            <td><strong>${escapeHtml(item.patientName)}</strong><span>${escapeHtml(item.patientAge ? `Age ${item.patientAge}` : item.id)}</span></td>
            <td><strong>${escapeHtml(item.doctorName)}</strong><span>${escapeHtml(doctorSpecialty(item.doctorId))}</span></td>
            <td><strong>${formatDate(item.date)}</strong><span>${formatTime(item.time)}</span></td>
            <td>${escapeHtml(item.service)}</td>
            <td><span class="admin-status ${item.status}">${escapeHtml(adminStatusLabel(item.status))}</span></td>
            <td>
              ${item.status === "pending" ? html`
                <button class="admin-action approve" data-appointment-status="confirmed" data-appointment-id="${escapeHtml(item.id)}" type="button">Approve</button>
                <button class="admin-action decline" data-appointment-status="rejected" data-appointment-id="${escapeHtml(item.id)}" type="button">Decline</button>
              ` : `<span class="subtle">No action</span>`}
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function doctorSpecialty(id) {
  return doctorProfiles().find(doctor => doctor.id === id)?.specialty || "Clinic Doctor";
}

function adminStatusLabel(status) {
  if (status === "confirmed") return "Approved";
  if (status === "rejected") return "Declined";
  return "Pending";
}

function adminQueue() {
  const queueItems = adminQueueItems();
  const current = queueItems[state.queuePointer] || queueItems.find(item => item.status === "confirmed") || queueItems[0];
  const currentQueueNumber = current ? queueDisplayNumber(current, state.queuePointer) : "000";
  const waiting = queueItems.filter((item, index) => item.status === "pending" || index > state.queuePointer).length;
  const done = queueItems.filter((item, index) => item.status === "confirmed" && index < state.queuePointer).length;
  shell(html`
    <div class="admin-page-head">
      <div><h1>Queue Monitor</h1><p>Real-time patient queue management</p></div>
      <button class="admin-primary-btn" id="callNextPatientBtn" type="button">Call Next Patient</button>
    </div>
    <div class="admin-feature-grid queue-stats">
      ${adminQueueStat("T", waiting, "Waiting", "blue")}
      ${adminQueueStat("C", done, "Completed", "green")}
      ${adminQueueStat("P", queueItems.length, "Total Queue", "pink")}
    </div>
    <section class="now-serving-admin">
      <div><span>Now Serving</span><h2>${current ? `Q-${currentQueueNumber} - ${escapeHtml(current.patientName || "Patient")}` : "No patient in queue"}</h2><p>${current ? `${escapeHtml(current.doctorName)} - ${formatTime(current.time)}` : "Approve appointments to build the queue"}</p></div>
      <strong>${currentQueueNumber}</strong>
    </section>
    <section class="admin-card queue-table-card">
      <div class="admin-card-head"><h2>Queue List</h2><button class="link-button" data-view="adminQueue" type="button">Refresh</button></div>
      ${adminQueueTable(queueItems)}
    </section>
  `);
}

function adminQueueStat(icon, value, label, tone) {
  return `<section class="admin-feature-card ${tone} compact"><span>${escapeHtml(icon)}</span><strong>${escapeHtml(value)}</strong><p>${escapeHtml(label)}</p></section>`;
}

function queueDisplayNumber(item, fallbackIndex) {
  return String(item?.queueNumber || fallbackIndex + 1).padStart(3, "0");
}

function adminQueueItems() {
  return state.adminAppointments
    .filter(item => item.status === "confirmed" || item.status === "pending")
    .slice()
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
}

function adminQueueTable(items) {
  if (!items.length) return `<div class="admin-empty"><p>No queue entries yet.</p></div>`;
  return html`
    <table class="admin-table">
      <thead><tr><th>Queue #</th><th>Patient</th><th>Doctor</th><th>Scheduled</th><th>Wait</th><th>Status</th></tr></thead>
      <tbody>
        ${items.map((item, index) => html`
          <tr>
            <td><strong class="queue-number">Q-${queueDisplayNumber(item, index)}</strong></td>
            <td>${escapeHtml(item.patientName || "Patient")}</td>
            <td>${escapeHtml(item.doctorName)}</td>
            <td>${formatTime(item.time)}</td>
            <td>${index < state.queuePointer ? "0 min" : index === state.queuePointer ? "Now" : `~${(index - state.queuePointer) * 18} min`}</td>
            <td><span class="admin-status ${index < state.queuePointer ? "confirmed" : index === state.queuePointer ? "session" : "pending"}">${index < state.queuePointer ? "Done" : index === state.queuePointer ? "In Progress" : "Waiting"}</span></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function adminDoctors() {
  const profiles = doctorProfiles();
  const counts = profiles.reduce((totals, doctor) => {
    totals[currentDoctorStatus(doctor.id)] += 1;
    return totals;
  }, { available: 0, session: 0, unavailable: 0 });
  shell(html`
    <div class="admin-page-head"><div><h1>Doctor Monitor</h1><p>Manage and monitor doctor availability status</p></div></div>
    <div class="doctor-status-summary">
      ${adminDoctorCount("available", counts.available, "Available")}
      ${adminDoctorCount("session", counts.session, "On Session")}
      ${adminDoctorCount("unavailable", counts.unavailable, "Unavailable")}
    </div>
    <div class="doctor-monitor-grid">
      ${profiles.map(doctor => adminDoctorCard(doctor)).join("")}
    </div>
  `);
}

function adminDoctorCount(status, count, label) {
  return `<section class="admin-soft-card doctor-count"><span class="status-dot ${status}"></span><strong>${count}</strong><p>${escapeHtml(label)}</p></section>`;
}

function adminDoctorCard(doctor) {
  const status = currentDoctorStatus(doctor.id);
  return html`
    <section class="admin-soft-card doctor-monitor-card">
      <div class="doctor-monitor-head">
        <span class="admin-avatar large">${initials(doctor.name.replace("Dr. ", ""))}</span>
        <div><h2>${escapeHtml(doctor.name)}</h2><p>${escapeHtml(doctor.specialty)}</p></div>
        ${doctorStatusBadge(status)}
      </div>
      <div class="doctor-meta">
        <p>Schedule: ${escapeHtml(doctor.schedule)}</p>
        <p>Rating: ${escapeHtml(doctor.rating)} - ${escapeHtml(doctor.patients)} patients today</p>
        <p>${escapeHtml(doctor.phone)}</p>
        <p>${escapeHtml(doctor.email)}</p>
      </div>
      <div class="doctor-status-actions">
        <button class="${status === "available" ? "active available" : ""}" data-doctor-id="${doctor.id}" data-doctor-status="available" type="button">Available</button>
        <button class="${status === "session" ? "active session" : ""}" data-doctor-id="${doctor.id}" data-doctor-status="session" type="button">Session</button>
        <button class="${status === "unavailable" ? "active unavailable" : ""}" data-doctor-id="${doctor.id}" data-doctor-status="unavailable" type="button">Unavailable</button>
      </div>
    </section>
  `;
}

function adminRecords() {
  const patients = adminPatients();
  const selected = patients.find(patient => patient.id === state.selectedAdminPatientId);
  shell(html`
    <div class="admin-page-head">
      <div><h1>Patients Record</h1><p>View and manage patient medical records</p></div>
      <label class="admin-search"><span>Search</span><input id="adminRecordSearch" value="${escapeHtml(state.adminSearch)}" placeholder="Search patient, doctor, condition..."></label>
    </div>
    <div class="admin-records-layout">
      <section class="admin-soft-card patient-list-card">
        <h2>${patients.length} Patients</h2>
        <div class="admin-patient-list">
          ${patients.map(patient => html`
            <button class="admin-patient-row ${patient.id === state.selectedAdminPatientId ? "active" : ""}" data-admin-patient="${escapeHtml(patient.id)}" type="button">
              <span class="admin-avatar">${initials(patient.name)}</span>
              <span><strong>${escapeHtml(patient.name)}</strong><small>${escapeHtml(patient.condition)} - ${escapeHtml(patient.doctor)}</small></span>
              <span><small>${escapeHtml(patient.lastVisit)}</small>${patient.active ? "<em>active</em>" : "<em class=\"inactive\">inactive</em>"}</span>
            </button>
          `).join("")}
        </div>
      </section>
      <aside class="admin-soft-card patient-detail-card">
        ${selected ? adminPatientDetail(selected) : `<div class="admin-empty record-placeholder"><h2>Patient Record</h2><p>Select a patient to view their record</p></div>`}
      </aside>
    </div>
  `);
}

function adminPatients() {
  const byName = new Map();
  state.adminAppointments.forEach(item => {
    const key = item.userId || item.patientName || item.id;
    const existing = byName.get(key) || {
      id: key,
      name: item.patientName || "Patient",
      doctor: item.doctorName,
      condition: item.service || "Clinic visit",
      lastVisit: formatDate(item.date),
      active: item.status !== "rejected",
      appointments: []
    };
    existing.appointments.push(item);
    existing.doctor = item.doctorName;
    existing.condition = item.service;
    existing.lastVisit = formatDate(item.date);
    existing.active = existing.active || item.status !== "rejected";
    byName.set(key, existing);
  });
  state.adminConversations.forEach(item => {
    if (!byName.has(item.id)) {
      byName.set(item.id, {
        id: item.id,
        name: item.name,
        doctor: "MediTrack Support",
        condition: item.email || "Client message",
        lastVisit: "Recent",
        active: true,
        appointments: []
      });
    }
  });
  const patients = Array.from(byName.values());
  const query = state.adminSearch.trim().toLowerCase();
  if (!query) return patients;
  return patients.filter(patient => `${patient.name} ${patient.doctor} ${patient.condition}`.toLowerCase().includes(query));
}

function adminPatientDetail(patient) {
  return html`
    <div class="patient-detail-head">
      <span class="admin-avatar large">${initials(patient.name)}</span>
      <div><h2>${escapeHtml(patient.name)}</h2><p>${escapeHtml(patient.condition)}</p>${patient.active ? "<em>active</em>" : "<em class=\"inactive\">inactive</em>"}</div>
    </div>
    <div class="patient-detail-grid">
      ${summaryLine("Primary Doctor", patient.doctor)}
      ${summaryLine("Last Visit", patient.lastVisit)}
      ${summaryLine("Appointments", patient.appointments.length)}
      ${summaryLine("Status", patient.active ? "Active" : "Inactive")}
    </div>
    <h3>Appointment History</h3>
    ${adminPatientHistory(patient.appointments)}
  `;
}

function adminPatientHistory(items) {
  if (!items.length) return `<div class="admin-empty compact-empty"><p>No appointments on record yet.</p></div>`;
  return html`
    <div class="patient-history-wrap">
      <table class="patient-history-table">
        <thead><tr><th>Patient</th><th>Doctor</th><th>Date & Time</th><th>Reason</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          ${items.map(item => html`
            <tr>
              <td><strong>${escapeHtml(item.patientName || "Patient")}</strong><span>${escapeHtml(item.id)}</span></td>
              <td><strong>${escapeHtml(item.doctorName)}</strong><span>${escapeHtml(doctorSpecialty(item.doctorId))}</span></td>
              <td><strong>${formatDate(item.date)}</strong><span>${formatTime(item.time)}</span></td>
              <td>${escapeHtml(item.service)}</td>
              <td><span class="admin-status ${item.status}">${escapeHtml(adminStatusLabel(item.status))}</span></td>
              <td>${item.status === "pending" ? "Needs approval" : "No action"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function adminChat() {
  const active = state.adminConversations.find(item => item.id === state.activePatientId);
  shell(html`
    <div class="admin-chat-layout">
      <aside class="admin-chat-list">
        <div class="admin-chat-list-head">
          <h1>Chat Support</h1>
          <p>Message clients about appointments and inquiries.</p>
        </div>
        <div class="admin-conversations">
          ${state.adminConversations.map(item => html`
            <button class="admin-conversation ${item.id === state.activePatientId ? "active" : ""}" data-patient-chat="${escapeHtml(item.id)}" type="button">
              <span class="admin-avatar">${initials(item.name)}</span>
              <span>
                <strong>${escapeHtml(item.name)}</strong>
                <small>${escapeHtml(item.lastMessage)}</small>
              </span>
              ${item.lastSender === "patient" ? `<em>New</em>` : ""}
            </button>
          `).join("")}
        </div>
      </aside>
      <section class="admin-chat-panel">
        <div class="admin-chat-head">
          <span class="admin-avatar">${initials(active?.name || "Patient")}</span>
          <div>
            <strong>${escapeHtml(active?.name || "Select a patient")}</strong>
            <p>${escapeHtml(active?.email || "")}</p>
          </div>
          <span class="admin-encrypted">Messages are encrypted</span>
        </div>
        <div class="admin-message-list" id="messageList">
          ${state.adminMessages.map(message => adminMessageBubble(message, active?.name)).join("")}
        </div>
        <form class="admin-composer" id="adminMessageForm">
          <input name="body" placeholder="Reply as clinic staff..." required autocomplete="off" ${state.activePatientId ? "" : "disabled"}>
          <button class="btn" type="submit" ${state.activePatientId ? "" : "disabled"}>Send</button>
        </form>
      </section>
    </div>
  `);
  const list = document.querySelector("#messageList");
  if (list) list.scrollTop = list.scrollHeight;
}

function adminMessageBubble(message, patientName = "Patient") {
  const senderName = message.sender === "support" ? "Clinic Staff" : patientName;
  return html`
    <div class="admin-bubble ${message.sender === "support" ? "staff" : ""}">
      <strong>${escapeHtml(senderName)}</strong>
      <p>${escapeHtml(message.body)}</p>
      <span class="subtle">${escapeHtml(message.createdAt)}</span>
    </div>
  `;
}

function formatTime(time) {
  const [hour, minute] = time.split(":").map(Number);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(date) {
  if (!date) return "-";
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

async function render() {
  try {
    if (!state.token) {
      authShell(state.view === "register" ? "register" : "login");
      return;
    }
    if (state.view === "registrationSuccess") {
      registrationSuccess();
      return;
    }
    await loadData();
    if (state.user?.role === "admin") {
      if (state.view === "adminAppointments") adminAppointments();
      else if (state.view === "adminQueue") adminQueue();
      else if (state.view === "adminDoctors") adminDoctors();
      else if (state.view === "adminRecords") adminRecords();
      else if (state.view === "adminChat") adminChat();
      else adminDashboard();
      return;
    }
    if (state.view === "appointments") appointments();
    else if (state.view === "bookingSuccess") bookingSuccess();
    else if (state.view === "queue") queue();
    else if (state.view === "doctorMonitor") doctorMonitor();
    else if (state.view === "records") records();
    else if (state.view === "notifications") notifications();
    else if (state.view === "chat") chat();
    else dashboard();
  } catch (error) {
    toast(error.message);
    if (error.message.includes("token")) logout();
  }
}

function logout() {
  localStorage.removeItem("token");
  state.token = "";
  state.user = null;
  state.activePatientId = "";
  state.adminAppointments = [];
  state.adminConversations = [];
  state.adminMessages = [];
  state.view = "login";
  render();
}

document.addEventListener("click", async event => {
  const view = event.target.closest("[data-view]")?.dataset.view;
  if (view) {
    if (view === "adminChat" && state.user?.role === "admin") {
      await request("/api/notifications/read", { method: "POST", body: "{}" });
      state.notifications = state.notifications.map(item => ({ ...item, read: true }));
    }
    setView(view);
    return;
  }

  const select = event.target.closest("[data-select]");
  if (select) {
    const type = select.dataset.select;
    const value = select.dataset.value;
    if (type === "doctor") state.booking.doctorId = value;
    if (type === "service") state.booking.service = value;
    if (type === "time") state.booking.time = value;
    state.bookingConfirmOpen = false;
    appointments();
    return;
  }

  const stepJump = event.target.closest("[data-booking-step]");
  if (stepJump) {
    const targetStep = Number(stepJump.dataset.bookingStep);
    if (targetStep <= state.bookingStep || (targetStep === 2 && state.booking.doctorId) || (targetStep === 3 && state.booking.service) || (targetStep === 4 && bookingReady())) {
      state.bookingStep = targetStep;
      appointments();
    }
    return;
  }

  if (event.target.closest("[data-booking-next]")) {
    if (state.bookingStep < 4) state.bookingStep += 1;
    appointments();
    return;
  }

  if (event.target.closest("[data-booking-prev]")) {
    if (state.bookingStep > 1) state.bookingStep -= 1;
    appointments();
    return;
  }

  if (event.target.closest("#logoutBtn")) {
    logout();
    return;
  }

  const adminFilter = event.target.closest("[data-admin-filter]");
  if (adminFilter) {
    state.adminAppointmentFilter = adminFilter.dataset.adminFilter;
    adminAppointments();
    return;
  }

  const doctorStatusAction = event.target.closest("[data-doctor-status]");
  if (doctorStatusAction) {
    const data = await request("/api/admin/doctor-statuses", {
      method: "POST",
      body: JSON.stringify({
        doctorId: doctorStatusAction.dataset.doctorId,
        status: doctorStatusAction.dataset.doctorStatus
      })
    });
    state.doctorStatuses = data.doctorStatuses || state.doctorStatuses;
    toast("Doctor status updated");
    adminDoctors();
    return;
  }

  const adminPatient = event.target.closest("[data-admin-patient]");
  if (adminPatient) {
    state.selectedAdminPatientId = adminPatient.dataset.adminPatient;
    adminRecords();
    return;
  }

  if (event.target.id === "callNextPatientBtn") {
    const queueItems = adminQueueItems();
    if (!queueItems.length) {
      toast("No patients in queue");
      return;
    }
    const current = queueItems[state.queuePointer] || queueItems[0];
    await request("/api/admin/appointments/status", {
      method: "POST",
      body: JSON.stringify({ id: current.id, status: "completed" })
    });
    state.queuePointer = 0;
    localStorage.setItem("queuePointer", "0");
    toast(`Queue #${current.queueNumber || ""} completed`);
    await render();
    return;
  }

  const appointmentAction = event.target.closest("[data-appointment-status]");
  if (appointmentAction) {
    await request("/api/admin/appointments/status", {
      method: "POST",
      body: JSON.stringify({
        id: appointmentAction.dataset.appointmentId,
        status: appointmentAction.dataset.appointmentStatus
      })
    });
    toast(`Appointment ${appointmentAction.dataset.appointmentStatus}`);
    await render();
    return;
  }

  const patientChat = event.target.closest("[data-patient-chat]");
  if (patientChat) {
    state.activePatientId = patientChat.dataset.patientChat;
    state.view = "adminChat";
    await render();
    return;
  }

  if (event.target.id === "bookBtn") {
    const dateInput = document.querySelector("#bookingDate");
    const notesInput = document.querySelector("#bookingNotes");
    if (dateInput) state.booking.date = dateInput.value;
    if (notesInput) state.booking.notes = notesInput.value;
    const data = await request("/api/appointments", {
      method: "POST",
      body: JSON.stringify(state.booking)
    });
    state.bookingConfirmOpen = false;
    state.lastBooked = data.appointment;
    state.booking = { doctorId: "", service: "", date: "", time: "", notes: "" };
    state.bookingStep = 1;
    setView("bookingSuccess");
  }

  if (event.target.id === "openBookingConfirmBtn") {
    state.booking.date = document.querySelector("#bookingDate").value;
    state.booking.notes = document.querySelector("#bookingNotes").value;
    if (state.booking.date < todayDate()) {
      state.booking.date = todayDate();
      toast("Please choose today or a future date");
      appointments();
      return;
    }
    state.bookingConfirmOpen = true;
    appointments();
    return;
  }

  if (event.target.id === "reviewBookingBtn") {
    state.bookingConfirmOpen = false;
    appointments();
    return;
  }

  if (event.target.id === "markReadBtn") {
    await request("/api/notifications/read", { method: "POST", body: "{}" });
    await render();
  }

  if (event.target.id === "exportXmlBtn") {
    const xml = await request("/api/appointments/xml");
    await navigator.clipboard.writeText(xml.xml);
    toast("Appointment XML copied to clipboard");
  }

  if (event.target.id === "importXmlBtn") {
    const xml = document.querySelector("#xmlInput").value;
    const data = await request("/api/appointments/import-xml", {
      method: "POST",
      body: JSON.stringify({ xml })
    });
    state.booking = {
      doctorId: data.appointment.doctorId,
      service: data.appointment.service,
      date: data.appointment.date,
      time: data.appointment.time,
      notes: data.appointment.notes || ""
    };
    state.bookingConfirmOpen = false;
    toast("XML parsed and transformed into a booking");
    appointments();
  }

  const tab = event.target.closest("[data-record-tab]")?.dataset.recordTab;
  if (tab) {
    document.querySelectorAll("[data-record-tab]").forEach(button => button.classList.toggle("active", button.dataset.recordTab === tab));
    document.querySelector("#recordPanel").innerHTML = tab === "profile" ? profileInfo() : recordHistory();
  }
});

document.addEventListener("change", event => {
  if (event.target.id === "bookingDate") {
    state.booking.date = event.target.value < todayDate() ? todayDate() : event.target.value;
    state.bookingConfirmOpen = false;
    appointments();
  }
});

document.addEventListener("input", event => {
  if (event.target.id === "bookingNotes") {
    state.booking.notes = event.target.value;
  }
  if (event.target.id === "adminAppointmentSearch") {
    state.adminSearch = event.target.value;
    adminAppointments();
    const search = document.querySelector("#adminAppointmentSearch");
    if (search) {
      search.focus();
      search.setSelectionRange(search.value.length, search.value.length);
    }
  }
  if (event.target.id === "adminRecordSearch") {
    state.adminSearch = event.target.value;
    adminRecords();
    const search = document.querySelector("#adminRecordSearch");
    if (search) {
      search.focus();
      search.setSelectionRange(search.value.length, search.value.length);
    }
  }
});

document.addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.target;
  const values = Object.fromEntries(new FormData(form).entries());

  try {
    if (form.id === "loginForm") {
      const data = await request("/api/login", { method: "POST", body: JSON.stringify(values) });
      state.token = data.token;
      localStorage.setItem("token", data.token);
      state.view = data.user.role === "admin" ? "adminDashboard" : "dashboard";
      await render();
    }

    if (form.id === "registerForm") {
      if (values.password !== values.confirmPassword) {
        toast("Passwords do not match");
        return;
      }
      const data = await request("/api/register", { method: "POST", body: JSON.stringify(values) });
      state.token = data.token;
      localStorage.setItem("token", data.token);
      state.registrationUser = data.user;
      state.view = "registrationSuccess";
      await render();
      setTimeout(() => {
        state.view = data.user.role === "admin" ? "adminDashboard" : "dashboard";
        render();
      }, 1800);
    }

    if (form.id === "messageForm") {
      await request("/api/messages", { method: "POST", body: JSON.stringify(values) });
      form.reset();
      await render();
    }

    if (form.id === "adminMessageForm") {
      await request("/api/admin/messages", {
        method: "POST",
        body: JSON.stringify({ userId: state.activePatientId, body: values.body })
      });
      form.reset();
      await render();
    }
  } catch (error) {
    toast(error.message);
  }
});

setInterval(async () => {
  if (state.token) {
    const notificationData = await request("/api/notifications");
    const previousUnread = unreadNotificationCount();
    const nextUnread = notificationData.notifications.filter(item => !item.read).length;
    state.notifications = notificationData.notifications;
    syncNotificationBadges();
    if (nextUnread > previousUnread && state.notifications[0]) {
      toast(state.notifications[0].title);
      if (state.user?.role === "admin" && state.view === "adminDashboard") adminDashboard();
    }
  }
  if (state.token && state.view === "chat") {
    const data = await request("/api/messages");
    if (data.messages.length !== state.messages.length) {
      state.messages = data.messages;
      chat();
    }
  }
  if (state.token && state.view === "adminChat" && state.activePatientId) {
    const data = await request(`/api/admin/messages?userId=${encodeURIComponent(state.activePatientId)}`);
    if (data.messages.length !== state.adminMessages.length) {
      state.adminMessages = data.messages;
      adminChat();
    }
  }
}, 4000);

render();
