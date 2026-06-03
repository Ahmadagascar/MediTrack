const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { consumeEvents, QUEUE } = require("./rabbit");

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "store.json");
const SECRET = process.env.MEDITRACK_SECRET || "dev-secret-change-me-for-production";
const ENC_KEY = crypto.createHash("sha256").update(`${SECRET}:encryption`).digest();

function readStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
  if (!fs.existsSync(DATA_FILE)) {
    throw new Error("Start server.js once before running the worker so data/store.json exists.");
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function writeStore(store) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
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

function encryptedMessage(id, userId, sender, body) {
  return {
    id,
    userId,
    sender,
    encryptedBody: encryptText(body),
    createdAt: new Date().toLocaleString()
  };
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

async function handleEvent(event) {
  const store = readStore();

  if (event.eventType === "appointment.created") {
    addNotification(
      store,
      event.userId,
      "Appointment Request Sent",
      `${event.service} with ${event.doctorName} is waiting for admin approval.`
    );
    console.log(`Queued notification for appointment ${event.appointmentId}`);
  }

  if (event.eventType === "appointment.statusChanged") {
    addNotification(
      store,
      event.userId,
      event.status === "confirmed" ? "Appointment Accepted" : "Appointment Updated",
      `${event.service} with ${event.doctorName} is now ${event.status}.`
    );
    console.log(`Queued status notification for appointment ${event.appointmentId}`);
  }

  if (event.eventType === "chat.autoReply") {
    store.messages.push(encryptedMessage(
      `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      event.userId,
      "support",
      "Thanks for messaging MediTrack Support. A clinic staff member will review this shortly."
    ));
    console.log(`Queued auto support reply for ${event.userId}`);
  }

  writeStore(store);
}

consumeEvents(handleEvent)
  .then(() => console.log(`MediTrack worker listening on RabbitMQ queue "${QUEUE}"`))
  .catch(error => {
    console.error("Could not start RabbitMQ worker:", error.message);
    process.exit(1);
  });
