const crypto = require("crypto");
const path = require("path");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const Razorpay = require("razorpay");

dotenv.config();
const db = require("./db");

let nodemailer = null;
try {
  // Optional dependency; app should still run without email transport.
  nodemailer = require("nodemailer");
} catch {
  nodemailer = null;
}

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = String(process.env.HOST || "").trim() || "0.0.0.0";
const DELIVERY_FEE = Number(process.env.DELIVERY_FEE || 40);
const BUSINESS_UPI_ID = process.env.BUSINESS_UPI_ID || "spiceroute@upi";
const BUSINESS_NAME = process.env.BUSINESS_NAME || "Bezawada Biryani House";
const SESSION_DAYS = 7;
const SMTP_HOST = String(process.env.SMTP_HOST || "").trim();
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = String(process.env.SMTP_USER || "").trim();
const SMTP_PASS = String(process.env.SMTP_PASS || "").trim();
const SMTP_FROM = String(process.env.SMTP_FROM || SMTP_USER || "").trim();
const smtpConfigured = Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS && SMTP_FROM);

const razorpayKeyId = String(process.env.RAZORPAY_KEY_ID || "").trim();
const razorpayKeySecret = String(process.env.RAZORPAY_KEY_SECRET || "").trim();
const looksLikePlaceholder =
  /your_key/i.test(razorpayKeyId) || /your_key/i.test(razorpayKeySecret);
const razorpayEnabled = Boolean(razorpayKeyId && razorpayKeySecret && !looksLikePlaceholder);
const razorpay = razorpayEnabled
  ? new Razorpay({ key_id: razorpayKeyId, key_secret: razorpayKeySecret })
  : null;
const mailer = smtpConfigured && nodemailer
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    })
  : null;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, originalHash] = String(stored || "").split(":");
  if (!salt || !originalHash) return false;
  const candidate = crypto.pbkdf2Sync(password, salt, 120000, 64, "sha512").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(originalHash));
}

function makeSession(user) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(
    "INSERT INTO sessions (token, user_id, role, expires_at, created_at) VALUES (?, ?, ?, ?, datetime('now'))"
  ).run(token, user.id, user.role, expiresAt);
  return token;
}

function makeOtp(userId, purpose) {
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const otpId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  db.prepare(
    "INSERT INTO email_otps (id, user_id, otp, purpose, expires_at, used, created_at) VALUES (?, ?, ?, ?, ?, 0, datetime('now'))"
  ).run(otpId, userId, otp, purpose, expiresAt);
  return otp;
}

function makeTempPassword(length = 12) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#%";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    const idx = Math.floor(Math.random() * alphabet.length);
    out += alphabet[idx];
  }
  return out;
}

async function sendOtpEmail({ toEmail, subject, otp, purposeLabel }) {
  if (!mailer) return false;
  await mailer.sendMail({
    from: SMTP_FROM,
    to: toEmail,
    subject,
    text: `${purposeLabel}\n\nYour OTP is: ${otp}\n\nThis OTP is valid for 10 minutes.`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>${BUSINESS_NAME}</h2>
        <p>${purposeLabel}</p>
        <p><strong>Your OTP is: ${otp}</strong></p>
        <p>This OTP is valid for 10 minutes.</p>
      </div>
    `
  });
  return true;
}

async function sendAdminCredentialsEmail({ toEmail, firstName, lastName, email, password }) {
  if (!mailer) return false;
  await mailer.sendMail({
    from: SMTP_FROM,
    to: toEmail,
    subject: `${BUSINESS_NAME} Admin Account Credentials`,
    text: `Hello ${firstName} ${lastName},\n\nYour admin account has been created.\n\nEmail: ${email}\nTemporary Password: ${password}\n\nPlease login and change your password.`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>${BUSINESS_NAME}</h2>
        <p>Hello ${firstName} ${lastName},</p>
        <p>Your admin account has been created.</p>
        <p><strong>Email:</strong> ${email}<br/><strong>Temporary Password:</strong> ${password}</p>
        <p>Please login and change your password.</p>
      </div>
    `
  });
  return true;
}

async function sendOrderInvoiceEmail({
  toEmail,
  orderId,
  createdAt,
  customerName,
  customerPhone,
  customerAddress,
  orderType,
  paymentMode,
  paymentStatus,
  subtotal,
  deliveryFee,
  total,
  items
}) {
  if (!mailer) return false;

  const safeItems = Array.isArray(items) ? items : [];
  const lines = [
    `Order ID: ${orderId}`,
    `Date: ${createdAt}`,
    `Customer: ${customerName}`,
    `Phone: ${customerPhone}`,
    `Address: ${customerAddress}`,
    `Order Type: ${orderType}`,
    `Payment Mode: ${paymentMode}`,
    `Payment Status: ${paymentStatus}`,
    "",
    "Items:"
  ];
  safeItems.forEach((item, idx) => {
    lines.push(
      `${idx + 1}. ${item.product_name} (${item.sku}) x${item.qty} @ ₹${item.price} = ₹${item.line_total}`
    );
  });
  lines.push("");
  lines.push(`Subtotal: ₹${subtotal}`);
  lines.push(`Delivery: ₹${deliveryFee}`);
  lines.push(`Total: ₹${total}`);
  const invoiceText = lines.join("\n");

  const rowsHtml = safeItems
    .map(
      (item) => `
      <tr>
        <td style="padding:8px;border:1px solid #ddd;">${item.product_name}</td>
        <td style="padding:8px;border:1px solid #ddd;">${item.sku}</td>
        <td style="padding:8px;border:1px solid #ddd;">${item.qty}</td>
        <td style="padding:8px;border:1px solid #ddd;">₹${item.price}</td>
        <td style="padding:8px;border:1px solid #ddd;">₹${item.line_total}</td>
      </tr>
    `
    )
    .join("");

  await mailer.sendMail({
    from: SMTP_FROM,
    to: toEmail,
    subject: `${BUSINESS_NAME} Order Confirmation - ${orderId}`,
    text: `Your order has been placed.\n\n${invoiceText}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.45;">
        <h2>${BUSINESS_NAME}</h2>
        <p>Your order has been placed successfully.</p>
        <p>
          <strong>Order ID:</strong> ${orderId}<br/>
          <strong>Date:</strong> ${createdAt}<br/>
          <strong>Customer:</strong> ${customerName}<br/>
          <strong>Phone:</strong> ${customerPhone}<br/>
          <strong>Address:</strong> ${customerAddress}<br/>
          <strong>Order Type:</strong> ${orderType}<br/>
          <strong>Payment Mode:</strong> ${paymentMode}<br/>
          <strong>Payment Status:</strong> ${paymentStatus}
        </p>
        <table style="border-collapse:collapse;width:100%;margin:12px 0;">
          <thead>
            <tr>
              <th style="text-align:left;padding:8px;border:1px solid #ddd;">Item</th>
              <th style="text-align:left;padding:8px;border:1px solid #ddd;">SKU</th>
              <th style="text-align:left;padding:8px;border:1px solid #ddd;">Qty</th>
              <th style="text-align:left;padding:8px;border:1px solid #ddd;">Price</th>
              <th style="text-align:left;padding:8px;border:1px solid #ddd;">Line Total</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <p>
          <strong>Subtotal:</strong> ₹${subtotal}<br/>
          <strong>Delivery:</strong> ₹${deliveryFee}<br/>
          <strong>Total:</strong> ₹${total}
        </p>
        <p>Invoice is attached with this email.</p>
      </div>
    `,
    attachments: [
      {
        filename: `invoice-${orderId}.txt`,
        content: invoiceText
      }
    ]
  });
  return true;
}

async function trySendOrderInvoiceEmail(payload) {
  try {
    const sent = await sendOrderInvoiceEmail(payload);
    if (!sent) {
      console.warn(`Order email not sent for ${payload.orderId}. SMTP is not configured.`);
    }
    return sent;
  } catch (error) {
    console.error(`Failed to send order email for ${payload.orderId}:`, error.message);
    return false;
  }
}

function getUserForToken(token) {
  if (!token) return null;
  return db
    .prepare(
      `
      SELECT u.*, s.token, s.expires_at
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token = ?
    `
    )
    .get(token);
}

function authMiddleware(req, res, next) {
  const authHeader = String(req.headers.authorization || "");
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const user = getUserForToken(token);
  if (!user) return res.status(401).json({ error: "Authentication required." });
  if (new Date(user.expires_at).getTime() < Date.now()) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    return res.status(401).json({ error: "Session expired. Please login again." });
  }
  req.user = user;
  req.token = token;
  next();
}

function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== "admin") return res.status(403).json({ error: "Admin access only." });
  next();
}

function customerOnly(req, res, next) {
  if (!req.user || req.user.role !== "customer") {
    return res.status(403).json({ error: "Customer access only." });
  }
  next();
}

function normalizeTableNo(value) {
  const raw = String(value || "").trim().toUpperCase();
  const match = raw.match(/^T(\d{1,3})$/);
  if (!match) return null;
  const num = Number(match[1]);
  if (!Number.isInteger(num) || num < 1 || num > 100) return null;
  return `T${String(num).padStart(2, "0")}`;
}

function normalizePhoneSlotNo(value) {
  const raw = String(value || "").trim().toUpperCase();
  const match = raw.match(/^P(\d{1,3})$/);
  if (!match) return null;
  const num = Number(match[1]);
  if (!Number.isInteger(num) || num < 1 || num > 100) return null;
  return `P${String(num).padStart(2, "0")}`;
}

function isOrderLocked(order) {
  if (!order) return false;
  return String(order.payment_status || "").toUpperCase() === "PAID" && String(order.status || "").toUpperCase() === "CLOSED";
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, razorpayEnabled, businessName: BUSINESS_NAME });
});

app.post("/api/auth/signup-customer", (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const firstName = String(req.body.firstName || "").trim();
  const lastName = String(req.body.lastName || "").trim();
  const phone = String(req.body.phone || "").trim();
  const address = String(req.body.address || "").trim();
  const country = String(req.body.country || "").trim();
  const state = String(req.body.state || "").trim();

  if (!email || !password || !firstName || !lastName || !phone || !address) {
    return res.status(400).json({ error: "All fields are required." });
  }

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) return res.status(409).json({ error: "Email already registered." });

  const phoneUsed = db.prepare("SELECT id FROM customers WHERE phone = ?").get(phone);
  if (phoneUsed) return res.status(409).json({ error: "Phone already registered." });

  const userId = `USR-${crypto.randomUUID()}`;
  const customerId = `CUS-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const fullName = `${firstName} ${lastName}`.trim();

  db.transaction(() => {
    db.prepare(
      "INSERT INTO customers (id, name, phone, address, country, state, registered_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))"
    ).run(customerId, fullName, phone, address, country || null, state || null);
    db.prepare(
      "INSERT INTO users (id, email, password_hash, role, email_verified, customer_id, created_at, updated_at) VALUES (?, ?, ?, 'customer', 1, ?, datetime('now'), datetime('now'))"
    ).run(userId, email, hashPassword(password), customerId);
  })();

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  const token = makeSession(user);
  res.status(201).json({
    token,
    user: { id: user.id, email: user.email, role: user.role, firstName, lastName }
  });
});

app.post("/api/auth/admin/register", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const firstName = String(req.body.firstName || "").trim();
  const lastName = String(req.body.lastName || "").trim();

  if (!email || !password || !firstName || !lastName) {
    return res.status(400).json({ error: "All fields are required." });
  }

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) return res.status(409).json({ error: "Email already registered." });

  const userId = `USR-${crypto.randomUUID()}`;
  db.prepare(
    "INSERT INTO users (id, email, password_hash, role, email_verified, first_name, last_name, created_at, updated_at) VALUES (?, ?, ?, 'admin', 0, ?, ?, datetime('now'), datetime('now'))"
  ).run(userId, email, hashPassword(password), firstName, lastName);

  const otp = makeOtp(userId, "verify_admin");
  try {
    const sent = await sendOtpEmail({
      toEmail: email,
      subject: `${BUSINESS_NAME} Admin Verification OTP`,
      otp,
      purposeLabel: "Use this OTP to verify your admin account."
    });
    if (!sent) {
      console.log(`Admin OTP for ${email}: ${otp}`);
      return res.status(201).json({
        message: "Admin registered. SMTP not configured, OTP logged on server for development use.",
        devOtp: otp
      });
    }
    return res.status(201).json({ message: "Admin registered. OTP sent to your email." });
  } catch (error) {
    console.error("Failed to send admin OTP email:", error.message);
    console.log(`Admin OTP for ${email}: ${otp}`);
    return res.status(201).json({
      message: "Admin registered, but email delivery failed. OTP logged on server for development use.",
      devOtp: otp
    });
  }
});

app.post("/api/admin/users", authMiddleware, adminOnly, async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const firstName = String(req.body.firstName || "").trim();
  const lastName = String(req.body.lastName || "").trim();
  const phone = String(req.body.phone || "").trim();
  const providedPassword = String(req.body.password || "").trim();
  const tempPassword = providedPassword || makeTempPassword(12);

  if (!email || !firstName || !lastName) {
    return res.status(400).json({ error: "email, firstName and lastName are required." });
  }
  if (tempPassword.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }

  const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (exists) return res.status(409).json({ error: "Email already registered." });
  if (phone) {
    const phoneExists = db
      .prepare("SELECT id FROM users WHERE role = 'admin' AND phone = ?")
      .get(phone);
    if (phoneExists) return res.status(409).json({ error: "Phone already used by another admin." });
  }

  const userId = `USR-${crypto.randomUUID()}`;
  db.prepare(
    "INSERT INTO users (id, email, password_hash, role, email_verified, first_name, last_name, phone, created_at, updated_at) VALUES (?, ?, ?, 'admin', 1, ?, ?, ?, datetime('now'), datetime('now'))"
  ).run(userId, email, hashPassword(tempPassword), firstName, lastName, phone || null);

  let emailSent = false;
  try {
    emailSent = await sendAdminCredentialsEmail({
      toEmail: email,
      firstName,
      lastName,
      email,
      password: tempPassword
    });
  } catch {
    emailSent = false;
  }

  return res.status(201).json({
    message: "Admin created successfully.",
    credentials: {
      email,
      password: tempPassword,
      firstName,
      lastName,
      phone: phone || ""
    },
    emailSent
  });
});

app.get("/api/admin/users", authMiddleware, adminOnly, (_req, res) => {
  const admins = db
    .prepare(
      `
      SELECT
        id,
        email,
        first_name,
        last_name,
        phone,
        email_verified,
        created_at,
        updated_at
      FROM users
      WHERE role = 'admin'
      ORDER BY datetime(created_at) DESC
    `
    )
    .all()
    .map((row) => ({
      id: row.id,
      email: row.email,
      firstName: row.first_name || "",
      lastName: row.last_name || "",
      phone: row.phone || "",
      emailVerified: Boolean(row.email_verified),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  return res.json(admins);
});

app.get("/api/admin/users/:id", authMiddleware, adminOnly, (req, res) => {
  const admin = db
    .prepare(
      `
      SELECT id, email, first_name, last_name, phone, email_verified, created_at, updated_at
      FROM users
      WHERE id = ? AND role = 'admin'
      LIMIT 1
    `
    )
    .get(req.params.id);
  if (!admin) return res.status(404).json({ error: "Admin not found." });
  return res.json({
    id: admin.id,
    email: admin.email,
    firstName: admin.first_name || "",
    lastName: admin.last_name || "",
    phone: admin.phone || "",
    emailVerified: Boolean(admin.email_verified),
    createdAt: admin.created_at,
    updatedAt: admin.updated_at
  });
});

app.patch("/api/admin/users/:id", authMiddleware, adminOnly, (req, res) => {
  const id = String(req.params.id || "").trim();
  const firstName = String(req.body.firstName || "").trim();
  const lastName = String(req.body.lastName || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const phone = String(req.body.phone || "").trim();
  const password = String(req.body.password || "").trim();
  const resetPassword = Boolean(req.body.resetPassword);

  if (!id) return res.status(400).json({ error: "Admin ID is required." });
  if (!firstName || !lastName || !email) {
    return res.status(400).json({ error: "firstName, lastName and email are required." });
  }

  const existing = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'admin'").get(id);
  if (!existing) return res.status(404).json({ error: "Admin not found." });

  const emailConflict = db.prepare("SELECT id FROM users WHERE email = ? AND id != ?").get(email, id);
  if (emailConflict) return res.status(409).json({ error: "Email already used by another user." });
  if (phone) {
    const phoneConflict = db
      .prepare("SELECT id FROM users WHERE role = 'admin' AND phone = ? AND id != ?")
      .get(phone, id);
    if (phoneConflict) return res.status(409).json({ error: "Phone already used by another admin." });
  }

  let nextPassword = "";
  if (resetPassword) {
    nextPassword = password || makeTempPassword(12);
    if (nextPassword.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }
    db.prepare(
      "UPDATE users SET first_name = ?, last_name = ?, email = ?, phone = ?, password_hash = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(firstName, lastName, email, phone || null, hashPassword(nextPassword), id);
  } else {
    db.prepare(
      "UPDATE users SET first_name = ?, last_name = ?, email = ?, phone = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(firstName, lastName, email, phone || null, id);
  }

  const updated = db
    .prepare(
      "SELECT id, email, first_name, last_name, phone, email_verified, created_at, updated_at FROM users WHERE id = ?"
    )
    .get(id);
  return res.json({
    admin: {
      id: updated.id,
      email: updated.email,
      firstName: updated.first_name || "",
      lastName: updated.last_name || "",
      phone: updated.phone || "",
      emailVerified: Boolean(updated.email_verified),
      createdAt: updated.created_at,
      updatedAt: updated.updated_at
    },
    updatedPassword: nextPassword || null
  });
});

app.delete("/api/admin/users/:id", authMiddleware, adminOnly, (req, res) => {
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ error: "Admin ID is required." });
  if (id === req.user.id) return res.status(400).json({ error: "You cannot delete your own admin account." });

  const existing = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'admin'").get(id);
  if (!existing) return res.status(404).json({ error: "Admin not found." });

  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
  db.prepare("DELETE FROM users WHERE id = ? AND role = 'admin'").run(id);
  return res.json({ ok: true });
});

app.post("/api/auth/admin/verify-otp", (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const otp = String(req.body.otp || "").trim();
  if (!email || !otp) return res.status(400).json({ error: "email and otp are required." });

  const user = db.prepare("SELECT * FROM users WHERE email = ? AND role = 'admin'").get(email);
  if (!user) return res.status(404).json({ error: "Admin user not found." });

  const row = db
    .prepare(
      `
      SELECT * FROM email_otps
      WHERE user_id = ? AND purpose = 'verify_admin' AND used = 0
      ORDER BY datetime(created_at) DESC
      LIMIT 1
    `
    )
    .get(user.id);
  if (!row) return res.status(400).json({ error: "OTP not found." });
  if (new Date(row.expires_at).getTime() < Date.now()) return res.status(400).json({ error: "OTP expired." });
  if (row.otp !== otp) return res.status(400).json({ error: "Invalid OTP." });

  db.transaction(() => {
    db.prepare("UPDATE email_otps SET used = 1 WHERE id = ?").run(row.id);
    db.prepare("UPDATE users SET email_verified = 1, updated_at = datetime('now') WHERE id = ?").run(user.id);
  })();

  res.json({ ok: true, message: "Admin email verified." });
});

app.post("/api/auth/login", (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (!email || !password) return res.status(400).json({ error: "email and password are required." });

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: "Invalid credentials." });
  }
  if (user.role === "admin" && !user.email_verified) {
    return res.status(403).json({ error: "Admin email not verified. Complete OTP verification." });
  }

  const token = makeSession(user);
  let firstName = "";
  let lastName = "";
  if (user.role === "admin") {
    firstName = user.first_name || "";
    lastName = user.last_name || "";
  } else if (user.customer_id) {
    const customer = db.prepare("SELECT name FROM customers WHERE id = ?").get(user.customer_id);
    const parts = String(customer?.name || "").trim().split(/\s+/).filter(Boolean);
    firstName = parts[0] || "";
    lastName = parts.slice(1).join(" ");
  }
  res.json({ token, user: { id: user.id, email: user.email, role: user.role, firstName, lastName } });
});

app.post("/api/auth/forgot-password/request", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  if (!email) return res.status(400).json({ error: "email is required." });
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user) return res.json({ ok: true, message: "If email exists, OTP is sent." });
  const otp = makeOtp(user.id, "reset_password");
  try {
    const sent = await sendOtpEmail({
      toEmail: email,
      subject: `${BUSINESS_NAME} Password Reset OTP`,
      otp,
      purposeLabel: "Use this OTP to reset your password."
    });
    if (!sent) {
      console.log(`Password reset OTP for ${email}: ${otp}`);
      return res.json({
        ok: true,
        message: "SMTP not configured, OTP logged on server for development use.",
        devOtp: otp
      });
    }
    return res.json({ ok: true, message: "OTP sent to your email." });
  } catch (error) {
    console.error("Failed to send password reset OTP email:", error.message);
    console.log(`Password reset OTP for ${email}: ${otp}`);
    return res.json({
      ok: true,
      message: "Email delivery failed, OTP logged on server for development use.",
      devOtp: otp
    });
  }
});

app.post("/api/auth/forgot-password/confirm", (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const otp = String(req.body.otp || "").trim();
  const newPassword = String(req.body.newPassword || "");
  if (!email || !otp || !newPassword) {
    return res.status(400).json({ error: "email, otp and newPassword are required." });
  }
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user) return res.status(404).json({ error: "User not found." });
  const row = db
    .prepare(
      `
      SELECT * FROM email_otps
      WHERE user_id = ? AND purpose = 'reset_password' AND used = 0
      ORDER BY datetime(created_at) DESC
      LIMIT 1
    `
    )
    .get(user.id);
  if (!row) return res.status(400).json({ error: "OTP not found." });
  if (new Date(row.expires_at).getTime() < Date.now()) return res.status(400).json({ error: "OTP expired." });
  if (row.otp !== otp) return res.status(400).json({ error: "Invalid OTP." });

  db.transaction(() => {
    db.prepare("UPDATE email_otps SET used = 1 WHERE id = ?").run(row.id);
    db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(
      hashPassword(newPassword),
      user.id
    );
  })();
  return res.json({ ok: true, message: "Password reset successful." });
});

app.post("/api/auth/logout", authMiddleware, (req, res) => {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(req.token);
  res.json({ ok: true });
});

app.get("/api/auth/me", authMiddleware, (req, res) => {
  const base = { id: req.user.id, email: req.user.email, role: req.user.role, emailVerified: !!req.user.email_verified };
  if (req.user.role === "admin") {
    return res.json({
      ...base,
      firstName: req.user.first_name || "",
      lastName: req.user.last_name || ""
    });
  }
  if (req.user.role === "customer" && req.user.customer_id) {
    const customer = db.prepare("SELECT * FROM customers WHERE id = ?").get(req.user.customer_id);
    const parts = String(customer?.name || "").trim().split(/\s+/).filter(Boolean);
    return res.json({
      ...base,
      customer: {
        id: customer?.id || req.user.customer_id,
        firstName: parts[0] || "",
        lastName: parts.slice(1).join(" "),
        phone: customer?.phone || "",
        address: customer?.address || "",
        country: customer?.country || "",
        state: customer?.state || "",
        registeredAt: customer?.registered_at || null
      }
    });
  }
  return res.json(base);
});

app.patch("/api/auth/admin/profile", authMiddleware, adminOnly, (req, res) => {
  const firstName = String(req.body.firstName || "").trim();
  const lastName = String(req.body.lastName || "").trim();
  const password = String(req.body.password || "");
  if (!firstName || !lastName) {
    return res.status(400).json({ error: "firstName and lastName are required." });
  }

  if (password) {
    db.prepare(
      "UPDATE users SET first_name = ?, last_name = ?, password_hash = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(firstName, lastName, hashPassword(password), req.user.id);
  } else {
    db.prepare("UPDATE users SET first_name = ?, last_name = ?, updated_at = datetime('now') WHERE id = ?").run(
      firstName,
      lastName,
      req.user.id
    );
  }

  res.json({ ok: true });
});

app.patch("/api/auth/profile", authMiddleware, customerOnly, (req, res) => {
  const firstName = String(req.body.firstName || "").trim();
  const lastName = String(req.body.lastName || "").trim();
  const phone = String(req.body.phone || "").trim();
  const address = String(req.body.address || "").trim();
  const country = String(req.body.country || "").trim();
  const state = String(req.body.state || "").trim();
  if (!firstName || !lastName || !phone || !address) {
    return res.status(400).json({ error: "firstName, lastName, phone and address are required." });
  }
  const fullName = `${firstName} ${lastName}`.trim();
  const customerId = req.user.customer_id;
  if (!customerId) return res.status(400).json({ error: "Customer profile not found." });

  const conflict = db.prepare("SELECT id FROM customers WHERE phone = ? AND id != ?").get(phone, customerId);
  if (conflict) return res.status(409).json({ error: "Phone already used by another customer." });

  db.transaction(() => {
    db.prepare("UPDATE customers SET name = ?, phone = ?, address = ?, country = ?, state = ?, updated_at = datetime('now') WHERE id = ?").run(
      fullName,
      phone,
      address,
      country || null,
      state || null,
      customerId
    );
    db.prepare("UPDATE orders SET customer_name = ?, customer_phone = ?, customer_address = ?, updated_at = datetime('now') WHERE customer_id = ?").run(
      fullName,
      phone,
      address,
      customerId
    );
  })();
  res.json({ ok: true });
});

app.get("/api/my/orders", authMiddleware, customerOnly, (req, res) => {
  const customerId = req.user.customer_id;
  const orders = db
    .prepare("SELECT * FROM orders WHERE customer_id = ? ORDER BY datetime(created_at) DESC, id DESC")
    .all(customerId)
    .map((order) => ({
      ...order,
      items: db.prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC").all(order.id)
    }));
  res.json(orders);
});

app.get("/api/my/orders/:id", authMiddleware, customerOnly, (req, res) => {
  const customerId = req.user.customer_id;
  const order = db
    .prepare("SELECT * FROM orders WHERE id = ? AND customer_id = ?")
    .get(req.params.id, customerId);
  if (!order) return res.status(404).json({ error: "Order not found." });
  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC").all(order.id);
  res.json({ ...order, items });
});

app.get("/api/products", authMiddleware, (req, res) => {
  const activeOnly = req.query.activeOnly === "1";
  const category = req.query.category;

  let sql = "SELECT * FROM products";
  const clauses = [];
  const params = [];

  if (activeOnly) clauses.push("active = 1");
  if (category) {
    clauses.push("category = ?");
    params.push(category);
  }
  if (clauses.length) sql += ` WHERE ${clauses.join(" AND ")}`;

  sql += " ORDER BY datetime(updated_at) DESC, name ASC";
  const products = db.prepare(sql).all(...params).map((p) => ({ ...p, active: Boolean(p.active) }));
  res.json(products);
});

app.post("/api/products", authMiddleware, adminOnly, (req, res) => {
  const payload = normalizeProduct(req.body);
  if (!payload.ok) return res.status(400).json({ error: payload.error });

  const data = { ...payload.data, id: crypto.randomUUID() };

  try {
    db.prepare(`
      INSERT INTO products (id, name, category, sku, price, stock, description, image, active, updated_at)
      VALUES (@id, @name, @category, @sku, @price, @stock, @description, @image, @active, datetime('now'))
    `).run(data);

    const created = db.prepare("SELECT * FROM products WHERE id = ?").get(data.id);
    res.status(201).json({ ...created, active: Boolean(created.active) });
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) {
      return res.status(409).json({ error: "SKU must be unique." });
    }
    return res.status(500).json({ error: "Unable to create product." });
  }
});

app.put("/api/products/:id", authMiddleware, adminOnly, (req, res) => {
  const payload = normalizeProduct(req.body);
  if (!payload.ok) return res.status(400).json({ error: payload.error });

  const existing = db.prepare("SELECT id FROM products WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Product not found." });

  try {
    db.prepare(`
      UPDATE products
      SET name=@name, category=@category, sku=@sku, price=@price, stock=@stock,
          description=@description, image=@image, active=@active, updated_at=datetime('now')
      WHERE id=@id
    `).run({ ...payload.data, id: req.params.id });

    const updated = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
    res.json({ ...updated, active: Boolean(updated.active) });
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) {
      return res.status(409).json({ error: "SKU must be unique." });
    }
    return res.status(500).json({ error: "Unable to update product." });
  }
});

app.delete("/api/products/:id", authMiddleware, adminOnly, (req, res) => {
  const result = db.prepare("DELETE FROM products WHERE id = ?").run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: "Product not found." });
  res.status(204).send();
});

app.get("/api/orders", authMiddleware, adminOnly, (req, res) => {
  const status = (req.query.status || "").toUpperCase();
  const channel = (req.query.channel || "").toUpperCase();
  const params = [];
  let sql = "SELECT * FROM orders";
  const clauses = [];

  if (["PENDING", "OPEN", "CLOSED"].includes(status)) {
    clauses.push("status = ?");
    params.push(status);
  }
  if (["ONLINE", "DINE_IN", "PHONE_ORDER"].includes(channel)) {
    clauses.push("order_channel = ?");
    params.push(channel);
  }
  if (clauses.length) {
    sql += ` WHERE ${clauses.join(" AND ")}`;
  }

  sql += " ORDER BY datetime(created_at) DESC, id DESC";
  const orders = db.prepare(sql).all(...params).map((order) => {
    const items = db.prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC").all(order.id);
    return { ...order, items };
  });

  res.json(orders);
});

app.get("/api/orders/:id", authMiddleware, adminOnly, (req, res) => {
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found." });
  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC").all(req.params.id);
  return res.json({ ...order, items });
});

app.get("/api/admin/dine-in/tables", authMiddleware, adminOnly, (_req, res) => {
  const rows = db
    .prepare(
      `
      SELECT table_no, MAX(datetime(updated_at)) AS last_seen
      FROM orders
      WHERE order_channel = 'DINE_IN'
        AND table_no IS NOT NULL
        AND trim(table_no) != ''
        AND NOT (payment_status = 'PAID' AND status = 'CLOSED')
      GROUP BY table_no
      ORDER BY datetime(last_seen) DESC
    `
    )
    .all();
  res.json(rows.map((r) => ({ tableNo: r.table_no, lastSeen: r.last_seen })));
});

app.get("/api/admin/dine-in/table-grid", authMiddleware, adminOnly, (_req, res) => {
  const rows = db
    .prepare(
      `
      SELECT *
      FROM orders
      WHERE order_channel = 'DINE_IN'
        AND table_no IS NOT NULL
        AND trim(table_no) != ''
        AND NOT (payment_status = 'PAID' AND status = 'CLOSED')
      ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC, id DESC
    `
    )
    .all();

  const latestByTable = new Map();
  for (const row of rows) {
    const tableNo = String(row.table_no || "").trim();
    if (!tableNo) continue;
    if (!latestByTable.has(tableNo)) latestByTable.set(tableNo, row);
  }

  const tables = Array.from({ length: 100 }, (_, i) => {
    const tableNo = `T${String(i + 1).padStart(2, "0")}`;
    const order = latestByTable.get(tableNo) || null;
    return {
      tableNo,
      orderId: order?.id || null,
      customerName: order?.customer_name || null,
      status: order?.status || null,
      paymentStatus: order?.payment_status || null,
      total: order?.total || 0,
      updatedAt: order?.updated_at || null
    };
  });

  return res.json(tables);
});

app.get("/api/admin/dine-in/by-table", authMiddleware, adminOnly, (req, res) => {
  const tableNo = normalizeTableNo(req.query.tableNo);
  if (!tableNo) return res.status(400).json({ error: "Invalid tableNo. Use T01 to T100." });
  const order = db
    .prepare(
      `
      SELECT *
      FROM orders
      WHERE order_channel = 'DINE_IN'
        AND table_no = ?
        AND NOT (payment_status = 'PAID' AND status = 'CLOSED')
      ORDER BY datetime(created_at) DESC
      LIMIT 1
    `
    )
    .get(tableNo);
  if (!order) return res.status(404).json({ error: "No active order found for this table." });
  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC").all(order.id);
  res.json({ ...order, items });
});

app.get("/api/admin/phone-order/tile-grid", authMiddleware, adminOnly, (_req, res) => {
  const rows = db
    .prepare(
      `
      SELECT *
      FROM orders
      WHERE order_channel = 'PHONE_ORDER'
        AND table_no IS NOT NULL
        AND trim(table_no) != ''
        AND NOT (payment_status = 'PAID' AND status = 'CLOSED')
      ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC, id DESC
    `
    )
    .all();

  const latestBySlot = new Map();
  for (const row of rows) {
    const slotNo = String(row.table_no || "").trim();
    if (!slotNo) continue;
    if (!latestBySlot.has(slotNo)) latestBySlot.set(slotNo, row);
  }

  const used = new Set(latestBySlot.keys());
  let nextAvailableSlot = null;
  for (let i = 1; i <= 100; i += 1) {
    const candidate = `P${String(i).padStart(2, "0")}`;
    if (!used.has(candidate)) {
      nextAvailableSlot = candidate;
      break;
    }
  }

  const tiles = Array.from(latestBySlot.values()).map((order) => ({
    slotNo: order.table_no,
    orderId: order.id,
    customerName: order.customer_name || null,
    status: order.status || null,
    paymentStatus: order.payment_status || null,
    total: order.total || 0,
    updatedAt: order.updated_at || null
  }));

  return res.json({ tiles, nextAvailableSlot });
});

app.get("/api/admin/phone-order/by-slot", authMiddleware, adminOnly, (req, res) => {
  const slotNo = normalizePhoneSlotNo(req.query.slotNo);
  if (!slotNo) return res.status(400).json({ error: "Invalid slotNo. Use P01 to P100." });
  const order = db
    .prepare(
      `
      SELECT *
      FROM orders
      WHERE order_channel = 'PHONE_ORDER'
        AND table_no = ?
        AND NOT (payment_status = 'PAID' AND status = 'CLOSED')
      ORDER BY datetime(created_at) DESC
      LIMIT 1
    `
    )
    .get(slotNo);
  if (!order) return res.status(404).json({ error: "No active order found for this slot." });
  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC").all(order.id);
  res.json({ ...order, items });
});

app.post("/api/admin/dine-in/order", authMiddleware, adminOnly, (req, res) => {
  const tableNo = normalizeTableNo(req.body.tableNo);
  const customerNameInput = String(req.body.customerName || "").trim();
  const customerPhoneInput = String(req.body.customerPhone || "").trim();
  const sanitizedItems = Array.isArray(req.body.cartItems) ? req.body.cartItems : [];

  if (!tableNo) return res.status(400).json({ error: "Invalid tableNo. Use T01 to T100." });
  if (!sanitizedItems.length) return res.status(400).json({ error: "Select at least one item." });

  const orderId = `DIN-${Date.now()}`;

  try {
    const result = db.transaction(() => {
      const existingOpen = db
        .prepare(
          `
          SELECT * FROM orders
          WHERE order_channel = 'DINE_IN'
            AND table_no = ?
            AND NOT (payment_status = 'PAID' AND status = 'CLOSED')
          ORDER BY datetime(created_at) DESC
          LIMIT 1
        `
        )
        .get(tableNo);

      const productById = db.prepare("SELECT * FROM products WHERE id = ?");
      const updateStock = db.prepare("UPDATE products SET stock = stock - ?, updated_at = datetime('now') WHERE id = ?");
      const insertItem = db.prepare(`
        INSERT INTO order_items (order_id, product_id, product_name, sku, qty, price, line_total)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const listExistingItemLines = db.prepare(
        "SELECT id, qty, line_total FROM order_items WHERE order_id = ? AND product_id = ? ORDER BY id ASC"
      );
      const updateItemLine = db.prepare(
        "UPDATE order_items SET qty = ?, line_total = ? WHERE id = ?"
      );
      const deleteItemLine = db.prepare("DELETE FROM order_items WHERE id = ?");

      let addedSubtotal = 0;
      const lineItems = [];
      for (const item of sanitizedItems) {
        const qty = Number(item.qty || 0);
        if (!item.id || qty <= 0) throw new Error("Invalid cart item.");
        const product = productById.get(item.id);
        if (!product || !product.active) throw new Error("One or more products unavailable.");
        if (product.stock < qty) throw new Error(`Insufficient stock for ${product.name}.`);
        const lineTotal = product.price * qty;
        addedSubtotal += lineTotal;
        lineItems.push({
          product_id: product.id,
          product_name: product.name,
          sku: product.sku,
          qty,
          price: product.price,
          line_total: lineTotal
        });
      }

      let targetOrderId = existingOpen?.id || orderId;
      if (!existingOpen) {
        const customerName = customerNameInput || `Table ${tableNo} Guest`;
        const customerPhone = customerPhoneInput || "-";
        db.prepare(`
          INSERT INTO orders (
            id, customer_id, order_type, order_channel, table_no, customer_name, customer_phone, customer_address, status,
            subtotal, delivery_fee, total, payment_mode, payment_status, created_at, updated_at
          ) VALUES (?, NULL, 'PICKUP', 'DINE_IN', ?, ?, ?, ?, 'OPEN', ?, 0, ?, 'DINE_IN', 'INITIATED', datetime('now'), datetime('now'))
        `).run(targetOrderId, tableNo, customerName, customerPhone, `Table ${tableNo}`, addedSubtotal, addedSubtotal);
      } else {
        const nextCustomerName = customerNameInput || existingOpen.customer_name || `Table ${tableNo} Guest`;
        const nextCustomerPhone = customerPhoneInput || existingOpen.customer_phone || "-";
        const nextSubtotal = Number(existingOpen.subtotal || 0) + addedSubtotal;
        const nextTotal = Number(existingOpen.total || 0) + addedSubtotal;
        db.prepare(`
          UPDATE orders
          SET customer_name = ?, customer_phone = ?, subtotal = ?, total = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(nextCustomerName, nextCustomerPhone, nextSubtotal, nextTotal, targetOrderId);
      }

      for (const line of lineItems) {
        const existingLines = listExistingItemLines.all(targetOrderId, line.product_id);
        if (!existingLines.length) {
          insertItem.run(
            targetOrderId,
            line.product_id,
            line.product_name,
            line.sku,
            line.qty,
            line.price,
            line.line_total
          );
        } else {
          const primary = existingLines[0];
          const mergedQty =
            existingLines.reduce((sum, item) => sum + Number(item.qty || 0), 0) + line.qty;
          const mergedLineTotal =
            existingLines.reduce((sum, item) => sum + Number(item.line_total || 0), 0) + line.line_total;
          updateItemLine.run(mergedQty, mergedLineTotal, primary.id);
          for (let i = 1; i < existingLines.length; i += 1) {
            deleteItemLine.run(existingLines[i].id);
          }
        }
        updateStock.run(line.qty, line.product_id);
      }

      const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(targetOrderId);
      const items = db.prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC").all(targetOrderId);
      return { order: { ...order, items }, mode: existingOpen ? "updated" : "created" };
    })();

    return res.status(201).json(result);
  } catch (error) {
    return res.status(400).json({ error: error.message || "Unable to create/update dine-in order." });
  }
});

app.post("/api/admin/phone-order/order", authMiddleware, adminOnly, (req, res) => {
  const slotNo = normalizePhoneSlotNo(req.body.tableNo || req.body.slotNo);
  const customerNameInput = String(req.body.customerName || "").trim();
  const customerPhoneInput = String(req.body.customerPhone || "").trim();
  const sanitizedItems = Array.isArray(req.body.cartItems) ? req.body.cartItems : [];

  if (!slotNo) return res.status(400).json({ error: "Invalid slotNo. Use P01 to P100." });
  if (!sanitizedItems.length) return res.status(400).json({ error: "Select at least one item." });

  const orderId = `PHN-${Date.now()}`;

  try {
    const result = db.transaction(() => {
      const existingOpen = db
        .prepare(
          `
          SELECT * FROM orders
          WHERE order_channel = 'PHONE_ORDER'
            AND table_no = ?
            AND NOT (payment_status = 'PAID' AND status = 'CLOSED')
          ORDER BY datetime(created_at) DESC
          LIMIT 1
        `
        )
        .get(slotNo);

      const productById = db.prepare("SELECT * FROM products WHERE id = ?");
      const updateStock = db.prepare("UPDATE products SET stock = stock - ?, updated_at = datetime('now') WHERE id = ?");
      const insertItem = db.prepare(`
        INSERT INTO order_items (order_id, product_id, product_name, sku, qty, price, line_total)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const listExistingItemLines = db.prepare(
        "SELECT id, qty, line_total FROM order_items WHERE order_id = ? AND product_id = ? ORDER BY id ASC"
      );
      const updateItemLine = db.prepare(
        "UPDATE order_items SET qty = ?, line_total = ? WHERE id = ?"
      );
      const deleteItemLine = db.prepare("DELETE FROM order_items WHERE id = ?");

      let addedSubtotal = 0;
      const lineItems = [];
      for (const item of sanitizedItems) {
        const qty = Number(item.qty || 0);
        if (!item.id || qty <= 0) throw new Error("Invalid cart item.");
        const product = productById.get(item.id);
        if (!product || !product.active) throw new Error("One or more products unavailable.");
        if (product.stock < qty) throw new Error(`Insufficient stock for ${product.name}.`);
        const lineTotal = product.price * qty;
        addedSubtotal += lineTotal;
        lineItems.push({
          product_id: product.id,
          product_name: product.name,
          sku: product.sku,
          qty,
          price: product.price,
          line_total: lineTotal
        });
      }

      const targetOrderId = existingOpen?.id || orderId;
      if (!existingOpen) {
        const customerName = customerNameInput || `Phone ${slotNo} Guest`;
        const customerPhone = customerPhoneInput || "-";
        db.prepare(`
          INSERT INTO orders (
            id, customer_id, order_type, order_channel, table_no, customer_name, customer_phone, customer_address, status,
            subtotal, delivery_fee, total, payment_mode, payment_status, created_at, updated_at
          ) VALUES (?, NULL, 'PICKUP', 'PHONE_ORDER', ?, ?, ?, ?, 'OPEN', ?, 0, ?, 'PHONE_ORDER', 'INITIATED', datetime('now'), datetime('now'))
        `).run(targetOrderId, slotNo, customerName, customerPhone, `Phone Slot ${slotNo}`, addedSubtotal, addedSubtotal);
      } else {
        const nextCustomerName = customerNameInput || existingOpen.customer_name || `Phone ${slotNo} Guest`;
        const nextCustomerPhone = customerPhoneInput || existingOpen.customer_phone || "-";
        const nextSubtotal = Number(existingOpen.subtotal || 0) + addedSubtotal;
        const nextTotal = Number(existingOpen.total || 0) + addedSubtotal;
        db.prepare(`
          UPDATE orders
          SET customer_name = ?, customer_phone = ?, subtotal = ?, total = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(nextCustomerName, nextCustomerPhone, nextSubtotal, nextTotal, targetOrderId);
      }

      for (const line of lineItems) {
        const existingLines = listExistingItemLines.all(targetOrderId, line.product_id);
        if (!existingLines.length) {
          insertItem.run(
            targetOrderId,
            line.product_id,
            line.product_name,
            line.sku,
            line.qty,
            line.price,
            line.line_total
          );
        } else {
          const primary = existingLines[0];
          const mergedQty =
            existingLines.reduce((sum, item) => sum + Number(item.qty || 0), 0) + line.qty;
          const mergedLineTotal =
            existingLines.reduce((sum, item) => sum + Number(item.line_total || 0), 0) + line.line_total;
          updateItemLine.run(mergedQty, mergedLineTotal, primary.id);
          for (let i = 1; i < existingLines.length; i += 1) {
            deleteItemLine.run(existingLines[i].id);
          }
        }
        updateStock.run(line.qty, line.product_id);
      }

      const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(targetOrderId);
      const items = db.prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC").all(targetOrderId);
      return { order: { ...order, items }, mode: existingOpen ? "updated" : "created" };
    })();

    return res.status(201).json(result);
  } catch (error) {
    return res.status(400).json({ error: error.message || "Unable to create/update phone order." });
  }
});

app.post("/api/admin/dine-in/mark-paid", authMiddleware, adminOnly, (req, res) => {
  const orderId = String(req.body.orderId || "").trim();
  const rawTableNo = String(req.body.tableNo || "").trim();
  const tableNo = rawTableNo ? normalizeTableNo(rawTableNo) : "";
  if (!orderId && !tableNo) {
    return res.status(400).json({ error: "orderId or tableNo is required." });
  }
  if (!orderId && rawTableNo && !tableNo) {
    return res.status(400).json({ error: "Invalid tableNo. Use T01 to T100." });
  }

  let order = null;
  if (orderId) {
    order = db.prepare("SELECT * FROM orders WHERE id = ? AND order_channel = 'DINE_IN'").get(orderId);
  } else {
    order = db
      .prepare(
        `
        SELECT * FROM orders
        WHERE order_channel = 'DINE_IN'
          AND table_no = ?
          AND NOT (payment_status = 'PAID' AND status = 'CLOSED')
        ORDER BY datetime(created_at) DESC
        LIMIT 1
      `
      )
      .get(tableNo);
  }
  if (!order) return res.status(404).json({ error: "Dine-in order not found." });
  if (isOrderLocked(order)) {
    return res.status(409).json({ error: "Paid and closed orders cannot be updated." });
  }

  db.prepare(
    "UPDATE orders SET payment_status = 'PAID', status = 'OPEN', updated_at = datetime('now') WHERE id = ?"
  ).run(order.id);
  const updated = db.prepare("SELECT * FROM orders WHERE id = ?").get(order.id);
  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC").all(order.id);
  return res.json({ ...updated, items });
});

app.get("/api/dashboard", authMiddleware, adminOnly, (_req, res) => {
  const periods = {
    week: "-6 days",
    month: "-1 month",
    year: "-1 year"
  };

  const countStmt = db.prepare(`
    SELECT COUNT(*) AS total
    FROM orders
    WHERE datetime(created_at) >= datetime('now', ?)
  `);

  const revenueStmt = db.prepare(`
    SELECT COALESCE(SUM(total), 0) AS total
    FROM orders
    WHERE payment_status = 'PAID'
      AND datetime(created_at) >= datetime('now', ?)
  `);

  const byPeriod = Object.entries(periods).reduce((acc, [key, offset]) => {
    acc[key] = {
      orders: countStmt.get(offset).total,
      revenue: revenueStmt.get(offset).total
    };
    return acc;
  }, {});

  const inception = {
    orders: db.prepare("SELECT COUNT(*) AS total FROM orders").get().total,
    revenue: db
      .prepare("SELECT COALESCE(SUM(total), 0) AS total FROM orders WHERE payment_status = 'PAID'")
      .get().total,
    customers: db.prepare("SELECT COUNT(*) AS total FROM customers").get().total
  };

  const categoryPerformance = db
    .prepare(`
      SELECT
        COALESCE(p.category, 'Uncategorized') AS category,
        COALESCE(SUM(oi.qty), 0) AS qty,
        COALESCE(SUM(oi.line_total), 0) AS revenue
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE o.payment_status = 'PAID'
      GROUP BY COALESCE(p.category, 'Uncategorized')
      ORDER BY revenue DESC, category ASC
    `)
    .all();

  const customerMix = db
    .prepare(`
      SELECT
        SUM(CASE WHEN t.total_orders > 1 THEN 1 ELSE 0 END) AS registered,
        SUM(CASE WHEN t.total_orders <= 1 THEN 1 ELSE 0 END) AS guest
      FROM (
        SELECT c.id, COUNT(o.id) AS total_orders
        FROM customers c
        LEFT JOIN orders o ON o.customer_id = c.id
        GROUP BY c.id
      ) t
    `)
    .get();

  res.json({ byPeriod, inception, categoryPerformance, customerMix });
});

app.get("/api/customers", authMiddleware, adminOnly, (_req, res) => {
  const customers = db
    .prepare(`
      SELECT
        c.id,
        c.name,
        c.phone,
        c.registered_at,
        COUNT(o.id) AS total_orders,
        COALESCE(SUM(CASE WHEN o.payment_status='PAID' THEN o.total ELSE 0 END), 0) AS total_spent
      FROM customers c
      LEFT JOIN orders o ON o.customer_id = c.id
      GROUP BY c.id, c.name, c.phone, c.registered_at
      ORDER BY total_orders DESC, c.name ASC
    `)
    .all()
    .map((row) => {
      const full = String(row.name || "").trim();
      const [first, ...rest] = full.split(/\s+/).filter(Boolean);
      const last = rest.join(" ");
      return {
        ...row,
        first_name: first || "",
        last_name: last || "",
        status: row.total_orders > 1 ? "Registered" : "Guest"
      };
    });

  res.json(customers);
});

app.patch("/api/customers/:id", authMiddleware, adminOnly, (req, res) => {
  const id = req.params.id;
  const firstName = String(req.body.firstName || "").trim();
  const lastName = String(req.body.lastName || "").trim();
  const name = `${firstName} ${lastName}`.trim();
  const phone = String(req.body.phone || "").trim();

  if (!firstName || !lastName || !phone) {
    return res.status(400).json({ error: "firstName, lastName and phone are required." });
  }

  const existing = db.prepare("SELECT * FROM customers WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Customer not found." });

  const conflict = db.prepare("SELECT id FROM customers WHERE phone = ? AND id != ?").get(phone, id);
  if (conflict) return res.status(409).json({ error: "Phone already used by another customer." });

  db.transaction(() => {
    db.prepare("UPDATE customers SET name = ?, phone = ?, updated_at = datetime('now') WHERE id = ?").run(name, phone, id);
    db.prepare("UPDATE orders SET customer_name = ?, customer_phone = ?, updated_at = datetime('now') WHERE customer_id = ?").run(name, phone, id);
  })();

  const customer = db.prepare("SELECT * FROM customers WHERE id = ?").get(id);
  return res.json(customer);
});

app.patch("/api/orders/:id/status", authMiddleware, adminOnly, (req, res) => {
  const status = String(req.body.status || "").toUpperCase();
  if (!["PENDING", "OPEN", "CLOSED"].includes(status)) {
    return res.status(400).json({ error: "Invalid status." });
  }

  const current = db.prepare("SELECT * FROM orders WHERE id = ?").get(req.params.id);
  if (!current) return res.status(404).json({ error: "Order not found." });
  if (isOrderLocked(current)) {
    return res.status(409).json({ error: "Paid and closed orders cannot be updated." });
  }

  const result = db
    .prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?")
    .run(status, req.params.id);

  if (!result.changes) return res.status(404).json({ error: "Order not found." });

  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(req.params.id);
  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC").all(req.params.id);
  res.json({ ...order, items });
});

app.patch("/api/orders/:id/payment-status", authMiddleware, adminOnly, (req, res) => {
  const paymentStatus = String(req.body.paymentStatus || "").toUpperCase();
  const allowedPaymentStatuses = ["INITIATED", "PAID", "FAILED", "REFUNDED"];
  if (!allowedPaymentStatuses.includes(paymentStatus)) {
    return res.status(400).json({ error: "Invalid payment status." });
  }

  const current = db.prepare("SELECT * FROM orders WHERE id = ?").get(req.params.id);
  if (!current) return res.status(404).json({ error: "Order not found." });
  if (isOrderLocked(current)) {
    return res.status(409).json({ error: "Paid and closed orders cannot be updated." });
  }

  const nextStatus = paymentStatus === "PAID" && current.status === "PENDING" ? "OPEN" : current.status;
  db.prepare("UPDATE orders SET payment_status = ?, status = ?, updated_at = datetime('now') WHERE id = ?").run(
    paymentStatus,
    nextStatus,
    req.params.id
  );

  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(req.params.id);
  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC").all(req.params.id);
  res.json({ ...order, items });
});

app.patch("/api/orders/:id/details", authMiddleware, adminOnly, (req, res) => {
  const orderId = req.params.id;
  const customerName = String(req.body.customerName || "").trim();
  const customerPhone = String(req.body.customerPhone || "").trim();
  const customerAddress = String(req.body.customerAddress || "").trim();
  const orderType = String(req.body.orderType || "").toUpperCase();
  const orderChannel = String(req.body.orderChannel || "ONLINE").toUpperCase();
  const rawTableNo = String(req.body.tableNo || "").trim();
  const tableNo = rawTableNo
    ? (orderChannel === "PHONE_ORDER" ? normalizePhoneSlotNo(rawTableNo) : normalizeTableNo(rawTableNo))
    : "";
  const status = String(req.body.status || "").toUpperCase();
  const paymentStatus = String(req.body.paymentStatus || "").toUpperCase();

  if (!["DELIVERY", "PICKUP"].includes(orderType)) {
    return res.status(400).json({ error: "Invalid order type." });
  }
  if (!["ONLINE", "DINE_IN", "PHONE_ORDER"].includes(orderChannel)) {
    return res.status(400).json({ error: "Invalid order channel." });
  }
  if (orderChannel === "DINE_IN" && !tableNo) {
    return res.status(400).json({ error: "Invalid tableNo. Use T01 to T100." });
  }
  if (orderChannel === "PHONE_ORDER" && !tableNo) {
    return res.status(400).json({ error: "Invalid slotNo. Use P01 to P100." });
  }
  if (orderType === "DELIVERY" && !customerAddress) {
    return res.status(400).json({ error: "customerAddress is required for delivery orders." });
  }
  if (!["PENDING", "OPEN", "CLOSED"].includes(status)) {
    return res.status(400).json({ error: "Invalid status." });
  }
  if (!["INITIATED", "PAID", "FAILED", "REFUNDED"].includes(paymentStatus)) {
    return res.status(400).json({ error: "Invalid payment status." });
  }

  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  if (!order) return res.status(404).json({ error: "Order not found." });
  if (isOrderLocked(order)) {
    return res.status(409).json({ error: "Paid and closed orders cannot be updated." });
  }
  const nextCustomerName =
    customerName ||
    order.customer_name ||
    (orderChannel === "DINE_IN" && tableNo
      ? `Table ${tableNo} Guest`
      : orderChannel === "PHONE_ORDER" && tableNo
        ? `Phone ${tableNo} Guest`
        : "");
  const nextCustomerPhone = customerPhone || order.customer_phone || "-";
  if (!nextCustomerName) return res.status(400).json({ error: "customerName is required." });

  try {
    db.transaction(() => {
      let effectiveCustomerId = order.customer_id;
      if (orderChannel === "ONLINE" && effectiveCustomerId) {
        const conflict = db
          .prepare("SELECT id FROM customers WHERE phone = ? AND id != ?")
          .get(nextCustomerPhone, effectiveCustomerId);
        if (conflict) throw new Error("Phone already used by another customer.");

        db.prepare("UPDATE customers SET name = ?, phone = ?, updated_at = datetime('now') WHERE id = ?").run(
          nextCustomerName,
          nextCustomerPhone,
          effectiveCustomerId
        );
        db.prepare(
          "UPDATE orders SET customer_name = ?, customer_phone = ?, updated_at = datetime('now') WHERE customer_id = ?"
        ).run(nextCustomerName, nextCustomerPhone, effectiveCustomerId);
      } else if (orderChannel === "ONLINE") {
        const existingByPhone = db.prepare("SELECT id FROM customers WHERE phone = ?").get(nextCustomerPhone);
        if (existingByPhone) {
          effectiveCustomerId = existingByPhone.id;
          db.prepare("UPDATE customers SET name = ?, updated_at = datetime('now') WHERE id = ?").run(
            nextCustomerName,
            effectiveCustomerId
          );
        } else {
          effectiveCustomerId = `CUS-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          db.prepare(
            "INSERT INTO customers (id, name, phone, registered_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'))"
          ).run(effectiveCustomerId, nextCustomerName, nextCustomerPhone);
        }
      } else {
        effectiveCustomerId = null;
      }

      const effectiveStatus = paymentStatus === "PAID" && status === "PENDING" ? "OPEN" : status;
      db.prepare(`
        UPDATE orders
        SET customer_id = ?, order_type = ?, order_channel = ?, table_no = ?, customer_name = ?, customer_phone = ?, customer_address = ?, status = ?, payment_status = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(
        effectiveCustomerId,
        orderType,
        orderChannel,
        orderChannel === "DINE_IN" || orderChannel === "PHONE_ORDER" ? tableNo : null,
        nextCustomerName,
        nextCustomerPhone,
        orderChannel === "DINE_IN"
          ? `Table ${tableNo}`
          : orderChannel === "PHONE_ORDER"
            ? `Phone Slot ${tableNo}`
          : orderType === "PICKUP"
            ? "Pickup at restaurant"
            : customerAddress,
        effectiveStatus,
        paymentStatus,
        orderId
      );
    })();
  } catch (error) {
    return res.status(409).json({ error: error.message || "Unable to update order details." });
  }

  const updated = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC").all(orderId);
  return res.json({ ...updated, items });
});

app.post("/api/admin/dine-in/orders/:id/add-items", authMiddleware, adminOnly, (req, res) => {
  const orderId = String(req.params.id || "").trim();
  const sanitizedItems = Array.isArray(req.body.cartItems) ? req.body.cartItems : [];
  if (!orderId) return res.status(400).json({ error: "Order ID is required." });
  if (!sanitizedItems.length) return res.status(400).json({ error: "Select at least one item." });

  try {
    const updated = db.transaction(() => {
      const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
      if (!order) throw new Error("Order not found.");
      if (String(order.order_channel || "").toUpperCase() !== "DINE_IN") {
        throw new Error("Only dine-in orders can be updated here.");
      }
      if (isOrderLocked(order)) {
        throw new Error("Paid and closed orders cannot be updated.");
      }

      const productById = db.prepare("SELECT * FROM products WHERE id = ?");
      const updateStock = db.prepare("UPDATE products SET stock = stock - ?, updated_at = datetime('now') WHERE id = ?");
      const insertItem = db.prepare(`
        INSERT INTO order_items (order_id, product_id, product_name, sku, qty, price, line_total)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const listExistingItemLines = db.prepare(
        "SELECT id, qty, line_total FROM order_items WHERE order_id = ? AND product_id = ? ORDER BY id ASC"
      );
      const updateItemLine = db.prepare(
        "UPDATE order_items SET qty = ?, line_total = ? WHERE id = ?"
      );
      const deleteItemLine = db.prepare("DELETE FROM order_items WHERE id = ?");

      let addedSubtotal = 0;
      const lineItems = [];
      for (const item of sanitizedItems) {
        const qty = Number(item.qty || 0);
        if (!item.id || qty <= 0) throw new Error("Invalid cart item.");
        const product = productById.get(item.id);
        if (!product || !product.active) throw new Error("One or more products unavailable.");
        if (Number(product.stock || 0) < qty) throw new Error(`Insufficient stock for ${product.name}.`);
        const lineTotal = Number(product.price || 0) * qty;
        addedSubtotal += lineTotal;
        lineItems.push({ product, qty, lineTotal });
      }

      for (const line of lineItems) {
        const existingLines = listExistingItemLines.all(orderId, line.product.id);
        if (!existingLines.length) {
          insertItem.run(
            orderId,
            line.product.id,
            line.product.name,
            line.product.sku,
            line.qty,
            line.product.price,
            line.lineTotal
          );
        } else {
          const primary = existingLines[0];
          const mergedQty =
            existingLines.reduce((sum, item) => sum + Number(item.qty || 0), 0) + line.qty;
          const mergedLineTotal =
            existingLines.reduce((sum, item) => sum + Number(item.line_total || 0), 0) + line.lineTotal;
          updateItemLine.run(mergedQty, mergedLineTotal, primary.id);
          for (let i = 1; i < existingLines.length; i += 1) {
            deleteItemLine.run(existingLines[i].id);
          }
        }
        updateStock.run(line.qty, line.product.id);
      }

      db.prepare(
        "UPDATE orders SET subtotal = subtotal + ?, total = total + ?, updated_at = datetime('now') WHERE id = ?"
      ).run(addedSubtotal, addedSubtotal, orderId);

      const refreshed = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
      const items = db.prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC").all(orderId);
      return { ...refreshed, items };
    })();

    return res.json(updated);
  } catch (error) {
    return res.status(400).json({ error: error.message || "Unable to add items to dine-in order." });
  }
});

app.post("/api/admin/phone-order/orders/:id/add-items", authMiddleware, adminOnly, (req, res) => {
  const orderId = String(req.params.id || "").trim();
  const sanitizedItems = Array.isArray(req.body.cartItems) ? req.body.cartItems : [];
  if (!orderId) return res.status(400).json({ error: "Order ID is required." });
  if (!sanitizedItems.length) return res.status(400).json({ error: "Select at least one item." });

  try {
    const updated = db.transaction(() => {
      const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
      if (!order) throw new Error("Order not found.");
      if (String(order.order_channel || "").toUpperCase() !== "PHONE_ORDER") {
        throw new Error("Only phone orders can be updated here.");
      }
      if (isOrderLocked(order)) {
        throw new Error("Paid and closed orders cannot be updated.");
      }

      const productById = db.prepare("SELECT * FROM products WHERE id = ?");
      const updateStock = db.prepare("UPDATE products SET stock = stock - ?, updated_at = datetime('now') WHERE id = ?");
      const insertItem = db.prepare(`
        INSERT INTO order_items (order_id, product_id, product_name, sku, qty, price, line_total)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const listExistingItemLines = db.prepare(
        "SELECT id, qty, line_total FROM order_items WHERE order_id = ? AND product_id = ? ORDER BY id ASC"
      );
      const updateItemLine = db.prepare(
        "UPDATE order_items SET qty = ?, line_total = ? WHERE id = ?"
      );
      const deleteItemLine = db.prepare("DELETE FROM order_items WHERE id = ?");

      let addedSubtotal = 0;
      const lineItems = [];
      for (const item of sanitizedItems) {
        const qty = Number(item.qty || 0);
        if (!item.id || qty <= 0) throw new Error("Invalid cart item.");
        const product = productById.get(item.id);
        if (!product || !product.active) throw new Error("One or more products unavailable.");
        if (Number(product.stock || 0) < qty) throw new Error(`Insufficient stock for ${product.name}.`);
        const lineTotal = Number(product.price || 0) * qty;
        addedSubtotal += lineTotal;
        lineItems.push({ product, qty, lineTotal });
      }

      for (const line of lineItems) {
        const existingLines = listExistingItemLines.all(orderId, line.product.id);
        if (!existingLines.length) {
          insertItem.run(
            orderId,
            line.product.id,
            line.product.name,
            line.product.sku,
            line.qty,
            line.product.price,
            line.lineTotal
          );
        } else {
          const primary = existingLines[0];
          const mergedQty =
            existingLines.reduce((sum, item) => sum + Number(item.qty || 0), 0) + line.qty;
          const mergedLineTotal =
            existingLines.reduce((sum, item) => sum + Number(item.line_total || 0), 0) + line.lineTotal;
          updateItemLine.run(mergedQty, mergedLineTotal, primary.id);
          for (let i = 1; i < existingLines.length; i += 1) {
            deleteItemLine.run(existingLines[i].id);
          }
        }
        updateStock.run(line.qty, line.product.id);
      }

      db.prepare(
        "UPDATE orders SET subtotal = subtotal + ?, total = total + ?, updated_at = datetime('now') WHERE id = ?"
      ).run(addedSubtotal, addedSubtotal, orderId);

      const refreshed = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
      const items = db.prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC").all(orderId);
      return { ...refreshed, items };
    })();

    return res.json(updated);
  } catch (error) {
    return res.status(400).json({ error: error.message || "Unable to add items to phone order." });
  }
});

app.post("/api/checkout/create-intent", authMiddleware, customerOnly, async (req, res) => {
  const { customerName, customerPhone, customerAddress, customerCountry, customerState, cartItems } = req.body;
  const orderType = String(req.body.orderType || "DELIVERY").toUpperCase();
  const paymentMode = String(req.body.paymentMode || "UPI").toUpperCase();
  const sanitizedItems = Array.isArray(cartItems) ? cartItems : [];

  if (!sanitizedItems.length) {
    return res.status(400).json({ error: "Cart is empty." });
  }
  if (!["DELIVERY", "PICKUP"].includes(orderType)) {
    return res.status(400).json({ error: "Invalid order type." });
  }
  if (!["UPI", "CARD", "APPLE_PAY", "GOOGLE_PAY"].includes(paymentMode)) {
    return res.status(400).json({ error: "Invalid payment mode." });
  }

  const orderId = `ODR-${Date.now()}`;

  try {
    const created = db.transaction(() => {
      const customer = db.prepare("SELECT * FROM customers WHERE id = ?").get(req.user.customer_id);
      if (!customer) throw new Error("Customer profile not found.");
      const effectiveName = String(customerName || customer.name || "").trim();
      const effectivePhone = String(customerPhone || customer.phone || "").trim();
      const effectiveAddress = String(customerAddress || customer.address || "").trim();
      const effectiveCountry = String(customerCountry || customer.country || "").trim();
      const effectiveState = String(customerState || customer.state || "").trim();
      if (!effectiveName || !effectivePhone) {
        throw new Error("Customer profile is incomplete.");
      }
      if (orderType === "DELIVERY" && !effectiveAddress) {
        throw new Error("Delivery address is required.");
      }

      const productById = db.prepare("SELECT * FROM products WHERE id = ?");
      const updateStock = db.prepare("UPDATE products SET stock = stock - ?, updated_at = datetime('now') WHERE id = ?");
      const updateCustomerProfile = db.prepare(
        "UPDATE customers SET name = ?, phone = ?, address = ?, country = ?, state = ?, updated_at = datetime('now') WHERE id = ?"
      );
      const insertOrder = db.prepare(`
        INSERT INTO orders (
          id, customer_id, order_type, order_channel, table_no, customer_name, customer_phone, customer_address, status,
          subtotal, delivery_fee, total, payment_mode, payment_status, created_at, updated_at
        ) VALUES (?, ?, ?, 'ONLINE', NULL, ?, ?, ?, 'PENDING', ?, ?, ?, ?, 'INITIATED', datetime('now'), datetime('now'))
      `);
      const insertItem = db.prepare(`
        INSERT INTO order_items (order_id, product_id, product_name, sku, qty, price, line_total)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      let subtotal = 0;
      const lineItems = [];

      for (const item of sanitizedItems) {
        const qty = Number(item.qty || 0);
        if (!item.id || qty <= 0) {
          throw new Error("Invalid cart item.");
        }

        const product = productById.get(item.id);
        if (!product || !product.active) throw new Error("One or more products unavailable.");
        if (product.stock < qty) throw new Error(`Insufficient stock for ${product.name}.`);

        const lineTotal = product.price * qty;
        subtotal += lineTotal;

        lineItems.push({
          order_id: orderId,
          product_id: product.id,
          product_name: product.name,
          sku: product.sku,
          qty,
          price: product.price,
          line_total: lineTotal
        });
      }

      const appliedDeliveryFee = orderType === "PICKUP" ? 0 : DELIVERY_FEE;
      const total = subtotal + appliedDeliveryFee;
      updateCustomerProfile.run(
        effectiveName,
        effectivePhone,
        effectiveAddress,
        effectiveCountry || null,
        effectiveState || null,
        customer.id
      );

      insertOrder.run(
        orderId,
        customer.id,
        orderType,
        effectiveName,
        effectivePhone,
        orderType === "PICKUP" ? "Pickup at restaurant" : effectiveAddress,
        subtotal,
        appliedDeliveryFee,
        total,
        paymentMode
      );

      for (const line of lineItems) {
        insertItem.run(
          line.order_id,
          line.product_id,
          line.product_name,
          line.sku,
          line.qty,
          line.price,
          line.line_total
        );
        updateStock.run(line.qty, line.product_id);
      }

      return {
        orderId,
        subtotal,
        total,
        lineItems,
        paymentMode,
        orderType,
        deliveryFee: appliedDeliveryFee,
        customerName: effectiveName,
        customerPhone: effectivePhone,
        customerAddress: orderType === "PICKUP" ? "Pickup at restaurant" : effectiveAddress,
        createdAt: new Date().toISOString()
      };
    })();

    const emailPayload = {
      toEmail: req.user.email,
      orderId: created.orderId,
      createdAt: created.createdAt,
      customerName: created.customerName,
      customerPhone: created.customerPhone,
      customerAddress: created.customerAddress,
      orderType: created.orderType,
      paymentMode: created.paymentMode,
      paymentStatus: "INITIATED",
      subtotal: created.subtotal,
      deliveryFee: created.deliveryFee,
      total: created.total,
      items: created.lineItems
    };

    if (razorpayEnabled) {
      try {
        const rpOrder = await razorpay.orders.create({
          amount: created.total * 100,
          currency: "INR",
          receipt: orderId,
          notes: { internalOrderId: orderId }
        });

        db.prepare("UPDATE orders SET payment_ref = ?, updated_at = datetime('now') WHERE id = ?").run(rpOrder.id, orderId);

        const emailSent = await trySendOrderInvoiceEmail(emailPayload);

        return res.status(201).json({
          orderId,
          total: created.total,
          emailSent,
          payment: {
            provider: "razorpay",
            keyId: razorpayKeyId,
            razorpayOrderId: rpOrder.id,
            amountPaise: rpOrder.amount,
            currency: rpOrder.currency,
            businessName: BUSINESS_NAME,
            paymentMode: created.paymentMode
          }
        });
      } catch (gatewayError) {
        console.warn("Razorpay order creation failed, falling back to UPI intent mode.");
      }
    }

    if (created.paymentMode !== "UPI") {
      const emailSent = await trySendOrderInvoiceEmail(emailPayload);
      return res.status(201).json({
        orderId,
        total: created.total,
        emailSent,
        payment: {
          provider: "manual_confirmation",
          paymentMode: created.paymentMode
        }
      });
    }

    const upiUri = `upi://pay?pa=${encodeURIComponent(BUSINESS_UPI_ID)}&pn=${encodeURIComponent(
      BUSINESS_NAME
    )}&tn=${encodeURIComponent(orderId)}&am=${created.total.toFixed(2)}&cu=INR`;

    const emailSent = await trySendOrderInvoiceEmail(emailPayload);

    return res.status(201).json({
      orderId,
      total: created.total,
      emailSent,
      payment: {
        provider: "upi_intent",
        paymentMode: created.paymentMode,
        upiId: BUSINESS_UPI_ID,
        upiUri
      }
    });
  } catch (error) {
    const reason =
      error?.error?.description ||
      error?.description ||
      error?.message ||
      "Unable to create order.";
    return res.status(400).json({ error: reason });
  }
});

app.post("/api/checkout/verify", authMiddleware, customerOnly, (req, res) => {
  if (!razorpayEnabled) {
    return res.status(400).json({ error: "Razorpay is not configured." });
  }

  const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
  if (!orderId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    return res.status(400).json({ error: "Incomplete payment data." });
  }

  const body = `${razorpayOrderId}|${razorpayPaymentId}`;
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest("hex");

  if (expected !== razorpaySignature) {
    return res.status(400).json({ error: "Invalid payment signature." });
  }

  const result = db.prepare(`
    UPDATE orders
    SET payment_status = 'PAID', status = 'OPEN', payment_ref = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(razorpayPaymentId, orderId);

  if (!result.changes) return res.status(404).json({ error: "Order not found." });
  return res.json({ ok: true, orderId, status: "OPEN" });
});

app.post("/api/checkout/mark-paid-manual", authMiddleware, customerOnly, (req, res) => {
  const { orderId, transactionRef } = req.body;
  if (!orderId) return res.status(400).json({ error: "orderId required." });

  const result = db.prepare(`
    UPDATE orders
    SET payment_status = 'PAID', status = 'OPEN', payment_ref = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(transactionRef || "MANUAL-UPI", orderId);

  if (!result.changes) return res.status(404).json({ error: "Order not found." });
  return res.json({ ok: true, orderId, status: "OPEN" });
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

function startServer(port, allowPortFallback = true) {
  const server = app.listen(port, HOST, () => {
    const printableHost = HOST === "0.0.0.0" ? "localhost" : HOST;
    console.log(`Food business app running on http://${printableHost}:${port}`);
    if (!razorpayEnabled) {
      console.log("Razorpay keys missing. Using fallback UPI intent checkout mode.");
    }
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE" && allowPortFallback) {
      const nextPort = port + 1;
      console.warn(`Port ${port} is busy. Trying ${nextPort}...`);
      startServer(nextPort, false);
      return;
    }
    console.error(`Failed to start server on ${HOST}:${port}`, error);
    process.exit(1);
  });
}

startServer(PORT);

function normalizeProduct(input) {
  const data = {
    name: String(input.name || "").trim(),
    category: String(input.category || "").trim(),
    sku: String(input.sku || "").trim(),
    price: Number(input.price),
    stock: Number(input.stock),
    description: String(input.description || "").trim(),
    image: String(input.image || "").trim(),
    active: input.active ? 1 : 0
  };

  if (!data.name || !data.category || !data.sku || !data.description) {
    return { ok: false, error: "name, category, sku and description are required." };
  }
  if (!Number.isInteger(data.price) || data.price <= 0) {
    return { ok: false, error: "price must be a positive integer." };
  }
  if (!Number.isInteger(data.stock) || data.stock < 0) {
    return { ok: false, error: "stock must be 0 or more." };
  }

  return { ok: true, data };
}
