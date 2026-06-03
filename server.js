const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const { publishEvent } = require("./rabbit");

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "store.json");
const SECRET = process.env.MEDITRACK_SECRET || "dev-secret-change-me-for-production";
const ENC_KEY = crypto.createHash("sha256").update(`${SECRET}:encryption`).digest();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const doctors = {
  "doc-1": { id: "doc-1", name: "Dr. Cindy Anticamara", specialty: "General Practice", clinic: "Clinic 1" },
  "doc-2": { id: "doc-2", name: "Dr. Shin Nuel", specialty: "Dermatology", clinic: "Clinic 2" },
  "doc-3": { id: "doc-3", name: "Dr. Earlyn Nasol", specialty: "Neurology", clinic: "Clinic 3" },
  "doc-4": { id: "doc-4", name: "Dr. Erich Ulan-Ulan", specialty: "Cardiology", clinic: "Clinic 3" }
};

function seedStore() {
  return {
    users: [
      {
        id: "usr-1",
        patientId: "PAT-333056",
        name: "Airon Manlansing",
        email: "airon@example.com",
        phone: "12345678945",
        dob: "2005-08-23",
        bloodType: "Unknown",
        role: "patient",
        passwordHash: hashPassword("password123")
      },
      {
        id: "adm-1",
        patientId: "",
        name: "MediTrack Admin",
        email: "admin@meditrack.local",
        phone: "",
        dob: "",
        bloodType: "",
        role: "admin",
        passwordHash: hashPassword("admin123")
      }
    ],
    sessions: {},
    appointments: [
      {
        id: "APT-57254",
        userId: "usr-1",
        doctorId: "doc-4",
        doctorName: doctors["doc-4"].name,
        service: "ECG & Heart Check",
        date: "2026-05-26",
        time: "15:00",
        status: "pending",
        queueNumber: 13,
        estimatedWait: 18,
        notes: ""
      }
    ],
    notifications: [
      {
        id: "ntf-1",
        userId: "usr-1",
        title: "Welcome to MediTrack",
        body: "Your account has been created successfully.",
        read: false,
        createdAt: "Just now"
      }
    ],
    messages: [
      encryptedMessage("msg-1", "usr-1", "support", "Welcome to MediTrack, Airon! Feel free to message us for any appointment inquiries.")
    ],
    doctorStatuses: {
      "doc-1": "available",
      "doc-2": "session",
      "doc-3": "available",
      "doc-4": "unavailable"
    }
  };
}

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify(seedStore(), null, 2));
}

function readStore() {
  ensureStore();
  const store = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  let changed = false;
  store.users.forEach(user => {
    if (!user.role) {
      user.role = "patient";
      changed = true;
    }
  });
  if (!store.users.some(user => user.role === "admin")) {
    store.users.push({
      id: "adm-1",
      patientId: "",
      name: "MediTrack Admin",
      email: "admin@meditrack.local",
      phone: "",
      dob: "",
      bloodType: "",
      role: "admin",
      passwordHash: hashPassword("admin123")
    });
    changed = true;
  }
  if (!store.doctorStatuses) {
    store.doctorStatuses = {
      "doc-1": "available",
      "doc-2": "session",
      "doc-3": "available",
      "doc-4": "unavailable"
    };
    changed = true;
  }
  if (changed) writeStore(store);
  return store;
}

function writeStore(store) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(`${SECRET}:${password}`).digest("hex");
}

function makeToken() {
  return crypto.randomBytes(32).toString("hex");
}

function encryptText(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENC_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: encrypted.toString("base64")
  };
}

function decryptText(payload) {
  const decipher = crypto.createDecipheriv("aes-256-gcm", ENC_KEY, Buffer.from(payload.iv, "base64"));
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(payload.data, "base64")),
    decipher.final()
  ]).toString("utf8");
}

function encryptedMessage(id, userId, sender, body) {
  return {
    id,
    userId,
    sender,
    encryptedBody: encryptText(body),
    createdAt: new Date().toLocaleString()
  };
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function collectBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body is too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function jsonBody(req) {
  const raw = await collectBody(req);
  return raw ? JSON.parse(raw) : {};
}

function publicUser(user) {
  const { passwordHash, ...safe } = user;
  return safe;
}

function currentUser(req, store) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const userId = store.sessions[token];
  if (!userId) return null;
  return store.users.find(user => user.id === userId) || null;
}

function requireUser(req, res, store) {
  const user = currentUser(req, store);
  if (!user) {
    sendJson(res, 401, { error: "Invalid or expired token" });
    return null;
  }
  return user;
}

function requireAdmin(req, res, store) {
  const user = requireUser(req, res, store);
  if (!user) return null;
  if (user.role !== "admin") {
    sendJson(res, 403, { error: "Admin access is required" });
    return null;
  }
  return user;
}

function patientName(store, userId) {
  const user = store.users.find(item => item.id === userId);
  return user ? user.name : "Unknown Patient";
}

function addNotification(store, userId, title, body) {
  store.notifications.push({
    id: `ntf-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    userId,
    title,
    body,
    read: false,
    createdAt: "Just now"
  });
}

function notifyAdmins(store, title, body) {
  store.users
    .filter(user => user.role === "admin")
    .forEach(admin => addNotification(store, admin.id, title, body));
}

function queueEvent(routingKey, payload) {
  publishEvent(routingKey, payload).catch(error => {
    console.error(`RabbitMQ publish failed for ${routingKey}:`, error.message);
  });
}

function xmlEscape(value = "") {
  return String(value).replace(/[<>&'"]/g, char => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    "\"": "&quot;"
  }[char]));
}

function xmlUnescape(value = "") {
  return String(value)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/&amp;/g, "&");
}

function parseAppointmentXml(xml) {
  const get = tag => {
    const match = xml.match(new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*<\\/${tag}>`, "i"));
    return match ? xmlUnescape(match[1].trim()) : "";
  };
  if (!/<appointment[\s>]/i.test(xml)) throw new Error("XML must contain an appointment root element");
  return {
    doctorId: get("doctorId") || "doc-4",
    service: get("service") || "General Consultation",
    date: get("date"),
    time: get("time"),
    notes: get("notes")
  };
}

function appointmentToXml(item) {
  return [
    "<appointment>",
    `  <id>${xmlEscape(item.id)}</id>`,
    `  <doctorId>${xmlEscape(item.doctorId)}</doctorId>`,
    `  <doctorName>${xmlEscape(item.doctorName)}</doctorName>`,
    `  <service>${xmlEscape(item.service)}</service>`,
    `  <date>${xmlEscape(item.date)}</date>`,
    `  <time>${xmlEscape(item.time)}</time>`,
    `  <status>${xmlEscape(item.status)}</status>`,
    `  <queueNumber>${xmlEscape(item.queueNumber)}</queueNumber>`,
    "</appointment>"
  ].join("\n");
}

function nextQueueNumber(store, excludeId = "") {
  const activeNumbers = store.appointments
    .filter(item => item.id !== excludeId && ["pending", "confirmed"].includes(item.status))
    .map(item => Number(item.queueNumber) || 0);
  return (activeNumbers.length ? Math.max(...activeNumbers) : 0) + 1;
}

function routeStatic(req, res) {
  const requested = req.url === "/" ? "/index.html" : decodeURIComponent(req.url.split("?")[0]);
  const filePath = path.normalize(path.join(ROOT, requested));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return true;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return false;
  const ext = path.extname(filePath);
  res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

async function api(req, res) {
  const store = readStore();
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (req.method === "POST" && url.pathname === "/api/register") {
      const body = await jsonBody(req);
      if (store.users.some(user => user.email.toLowerCase() === body.email.toLowerCase())) {
        sendJson(res, 409, { error: "Email is already registered" });
        return;
      }
      const user = {
        id: `usr-${Date.now()}`,
        patientId: `PAT-${Math.floor(100000 + Math.random() * 900000)}`,
        name: `${body.firstName} ${body.lastName}`.trim(),
        email: body.email,
        phone: body.phone,
        dob: body.dob,
        bloodType: "Unknown",
        role: "patient",
        passwordHash: hashPassword(body.password)
      };
      const token = makeToken();
      store.users.push(user);
      store.sessions[token] = user.id;
      store.notifications.push({
        id: `ntf-${Date.now()}`,
        userId: user.id,
        title: "Registration Successful",
        body: `Welcome to MediTrack, ${body.firstName}! Your account has been created successfully.`,
        read: false,
        createdAt: "Just now"
      });
      store.messages.push(encryptedMessage(`msg-${Date.now()}`, user.id, "support", `Welcome to MediTrack, ${body.firstName}! Feel free to message us for any appointment inquiries.`));
      writeStore(store);
      sendJson(res, 201, { token, user: publicUser(user) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/login") {
      const body = await jsonBody(req);
      const user = store.users.find(item => item.email.toLowerCase() === body.email.toLowerCase());
      if (!user || user.passwordHash !== hashPassword(body.password)) {
        sendJson(res, 401, { error: "Invalid email or password" });
        return;
      }
      const token = makeToken();
      store.sessions[token] = user.id;
      writeStore(store);
      sendJson(res, 200, { token, user: publicUser(user) });
      return;
    }

    const user = requireUser(req, res, store);
    if (!user) return;

    if (req.method === "GET" && url.pathname === "/api/me") {
      sendJson(res, 200, { user: publicUser(user) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/doctor-statuses") {
      sendJson(res, 200, { doctorStatuses: store.doctorStatuses || {} });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/doctor-statuses") {
      const admin = requireAdmin(req, res, store);
      if (!admin) return;
      const body = await jsonBody(req);
      if (!doctors[body.doctorId]) {
        sendJson(res, 404, { error: "Doctor not found" });
        return;
      }
      if (!["available", "session", "unavailable"].includes(body.status)) {
        sendJson(res, 400, { error: "Invalid doctor status" });
        return;
      }
      store.doctorStatuses = store.doctorStatuses || {};
      store.doctorStatuses[body.doctorId] = body.status;
      writeStore(store);
      sendJson(res, 200, { doctorStatuses: store.doctorStatuses });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/appointments") {
      const admin = requireAdmin(req, res, store);
      if (!admin) return;
      const appointments = store.appointments.map(item => ({
        ...item,
        patientName: patientName(store, item.userId)
      }));
      sendJson(res, 200, { appointments });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/appointments") {
      const admin = requireAdmin(req, res, store);
      if (!admin) return;
      const body = await jsonBody(req);
      const patient = store.users.find(item => item.id === body.userId && item.role !== "admin");
      if (!patient) {
        sendJson(res, 404, { error: "Patient not found" });
        return;
      }
      const doctor = doctors[body.doctorId] || doctors["doc-4"];
      const appointment = {
        id: `APT-${Math.floor(10000 + Math.random() * 90000)}`,
        userId: patient.id,
        doctorId: doctor.id,
        doctorName: doctor.name,
        service: body.service || "General Consultation",
        date: body.date,
        time: body.time,
        status: "pending",
        queueNumber: nextQueueNumber(store),
        estimatedWait: Math.floor(10 + Math.random() * 40),
        notes: body.notes || ""
      };
      store.appointments.push(appointment);
      writeStore(store);
      queueEvent("appointment.createdByAdmin", {
        appointmentId: appointment.id,
        userId: patient.id,
        doctorName: appointment.doctorName,
        service: appointment.service
      });
      sendJson(res, 201, { appointment: { ...appointment, patientName: patient.name } });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/appointments/status") {
      const admin = requireAdmin(req, res, store);
      if (!admin) return;
      const body = await jsonBody(req);
      const appointment = store.appointments.find(item => item.id === body.id);
      if (!appointment) {
        sendJson(res, 404, { error: "Appointment not found" });
        return;
      }
      if (!["pending", "confirmed", "rejected", "completed"].includes(body.status)) {
        sendJson(res, 400, { error: "Invalid appointment status" });
        return;
      }
      appointment.status = body.status;
      if (["rejected", "completed"].includes(body.status)) {
        appointment.queueNumber = null;
      } else if (!appointment.queueNumber) {
        appointment.queueNumber = nextQueueNumber(store, appointment.id);
      }
      writeStore(store);
      queueEvent("appointment.statusChanged", {
        appointmentId: appointment.id,
        userId: appointment.userId,
        doctorName: appointment.doctorName,
        service: appointment.service,
        status: appointment.status
      });
      sendJson(res, 200, { appointment });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/conversations") {
      const admin = requireAdmin(req, res, store);
      if (!admin) return;
      const patients = store.users
        .filter(item => item.role !== "admin")
        .map(patient => {
          const messages = store.messages.filter(message => message.userId === patient.id);
          const last = messages[messages.length - 1];
          return {
            id: patient.id,
            name: patient.name,
            email: patient.email,
            lastMessage: last ? decryptText(last.encryptedBody) : "No messages yet",
            lastSender: last ? last.sender : ""
          };
        });
      sendJson(res, 200, { conversations: patients });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/admin/messages") {
      const admin = requireAdmin(req, res, store);
      if (!admin) return;
      const userId = url.searchParams.get("userId");
      const messages = store.messages
        .filter(item => item.userId === userId)
        .map(item => ({ id: item.id, sender: item.sender, body: decryptText(item.encryptedBody), createdAt: item.createdAt }));
      sendJson(res, 200, { messages });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/admin/messages") {
      const admin = requireAdmin(req, res, store);
      if (!admin) return;
      const body = await jsonBody(req);
      if (!store.users.some(item => item.id === body.userId && item.role !== "admin")) {
        sendJson(res, 404, { error: "Patient not found" });
        return;
      }
      store.messages.push(encryptedMessage(`msg-${Date.now()}`, body.userId, "support", body.body));
      addNotification(
        store,
        body.userId,
        "New Support Reply",
        "Clinic staff replied to your chat."
      );
      writeStore(store);
      sendJson(res, 201, { ok: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/appointments") {
      sendJson(res, 200, { appointments: store.appointments.filter(item => item.userId === user.id) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/appointments") {
      const body = await jsonBody(req);
      const doctor = doctors[body.doctorId] || doctors["doc-4"];
      const appointment = {
        id: `APT-${Math.floor(10000 + Math.random() * 90000)}`,
        userId: user.id,
        doctorId: doctor.id,
        doctorName: doctor.name,
        service: body.service,
        date: body.date,
        time: body.time,
        status: "pending",
        queueNumber: nextQueueNumber(store),
        estimatedWait: Math.floor(10 + Math.random() * 40),
        notes: body.notes || ""
      };
      store.appointments.push(appointment);
      writeStore(store);
      queueEvent("appointment.created", {
        appointmentId: appointment.id,
        userId: user.id,
        doctorName: appointment.doctorName,
        service: appointment.service
      });
      sendJson(res, 201, { appointment });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/appointments/xml") {
      const xml = `<appointments>\n${store.appointments.filter(item => item.userId === user.id).map(appointmentToXml).join("\n")}\n</appointments>`;
      sendJson(res, 200, { xml });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/appointments/import-xml") {
      const body = await jsonBody(req);
      const appointment = parseAppointmentXml(body.xml || "");
      sendJson(res, 200, { appointment });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/notifications") {
      sendJson(res, 200, { notifications: store.notifications.filter(item => item.userId === user.id).reverse() });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/notifications/read") {
      store.notifications.forEach(item => {
        if (item.userId === user.id) item.read = true;
      });
      writeStore(store);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/messages") {
      const messages = store.messages
        .filter(item => item.userId === user.id)
        .map(item => ({ id: item.id, sender: item.sender, body: decryptText(item.encryptedBody), createdAt: item.createdAt }));
      sendJson(res, 200, { messages });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/messages") {
      const body = await jsonBody(req);
      store.messages.push(encryptedMessage(`msg-${Date.now()}`, user.id, "patient", body.body));
      notifyAdmins(
        store,
        "New Patient Message",
        `${user.name} sent a chat message.`
      );
      writeStore(store);
      queueEvent("chat.autoReply", {
        userId: user.id
      });
      sendJson(res, 202, { accepted: true });
      return;
    }

    sendJson(res, 404, { error: "API route not found" });
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    api(req, res);
    return;
  }
  if (!routeStatic(req, res)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
});

function localNetworkUrls() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter(item => item && item.family === "IPv4" && !item.internal)
    .map(item => `http://${item.address}:${PORT}`);
}

server.listen(PORT, HOST, () => {
  ensureStore();
  console.log(`MediTrack running at http://localhost:${PORT}`);
  localNetworkUrls().forEach(url => console.log(`Network URL: ${url}`));
});
