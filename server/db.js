const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const dataDir = path.join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const configuredDbPath = String(process.env.SQLITE_PATH || "").trim();
const dbPath = configuredDbPath
  ? path.resolve(configuredDbPath)
  : path.join(dataDir, "foodbiz.sqlite");
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    sku TEXT NOT NULL UNIQUE,
    price INTEGER NOT NULL CHECK(price > 0),
    stock INTEGER NOT NULL CHECK(stock >= 0),
    description TEXT NOT NULL,
    image TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    customer_id TEXT,
    order_type TEXT NOT NULL DEFAULT 'DELIVERY',
    order_channel TEXT NOT NULL DEFAULT 'ONLINE',
    table_no TEXT,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_address TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('PENDING', 'OPEN', 'CLOSED')),
    subtotal INTEGER NOT NULL,
    delivery_fee INTEGER NOT NULL,
    total INTEGER NOT NULL,
    payment_mode TEXT NOT NULL,
    payment_status TEXT NOT NULL,
    payment_ref TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    sku TEXT NOT NULL,
    qty INTEGER NOT NULL CHECK(qty > 0),
    price INTEGER NOT NULL,
    line_total INTEGER NOT NULL,
    FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY(product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    address TEXT,
    registered_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('customer', 'admin')),
    email_verified INTEGER NOT NULL DEFAULT 0,
    customer_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(customer_id) REFERENCES customers(id)
  );

  CREATE TABLE IF NOT EXISTS email_otps (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    otp TEXT NOT NULL,
    purpose TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

const hasCustomerIdColumn = db
  .prepare("PRAGMA table_info(orders)")
  .all()
  .some((column) => column.name === "customer_id");
if (!hasCustomerIdColumn) {
  db.exec("ALTER TABLE orders ADD COLUMN customer_id TEXT");
}

const hasOrderTypeColumn = db
  .prepare("PRAGMA table_info(orders)")
  .all()
  .some((column) => column.name === "order_type");
if (!hasOrderTypeColumn) {
  db.exec("ALTER TABLE orders ADD COLUMN order_type TEXT NOT NULL DEFAULT 'DELIVERY'");
}

const hasOrderChannelColumn = db
  .prepare("PRAGMA table_info(orders)")
  .all()
  .some((column) => column.name === "order_channel");
if (!hasOrderChannelColumn) {
  db.exec("ALTER TABLE orders ADD COLUMN order_channel TEXT NOT NULL DEFAULT 'ONLINE'");
}

const hasTableNoColumn = db
  .prepare("PRAGMA table_info(orders)")
  .all()
  .some((column) => column.name === "table_no");
if (!hasTableNoColumn) {
  db.exec("ALTER TABLE orders ADD COLUMN table_no TEXT");
}

db.exec("UPDATE orders SET order_channel = 'ONLINE' WHERE order_channel IS NULL OR trim(order_channel) = ''");

const hasCustomerAddressColumn = db
  .prepare("PRAGMA table_info(customers)")
  .all()
  .some((column) => column.name === "address");
if (!hasCustomerAddressColumn) {
  db.exec("ALTER TABLE customers ADD COLUMN address TEXT");
}

const userColumns = db.prepare("PRAGMA table_info(users)").all();
const hasUserFirstName = userColumns.some((column) => column.name === "first_name");
const hasUserLastName = userColumns.some((column) => column.name === "last_name");
const hasUserPhone = userColumns.some((column) => column.name === "phone");
if (!hasUserFirstName) {
  db.exec("ALTER TABLE users ADD COLUMN first_name TEXT");
}
if (!hasUserLastName) {
  db.exec("ALTER TABLE users ADD COLUMN last_name TEXT");
}
if (!hasUserPhone) {
  db.exec("ALTER TABLE users ADD COLUMN phone TEXT");
}

const adminsMissingNames = db
  .prepare("SELECT id, email FROM users WHERE role = 'admin' AND (first_name IS NULL OR first_name = '' OR last_name IS NULL OR last_name = '')")
  .all();
if (adminsMissingNames.length) {
  const updateAdminName = db.prepare(
    "UPDATE users SET first_name = ?, last_name = ?, updated_at = datetime('now') WHERE id = ?"
  );
  const backfill = db.transaction((rows) => {
    rows.forEach((row) => {
      const localPart = String(row.email || "admin").split("@")[0] || "admin";
      const first = localPart.charAt(0).toUpperCase() + localPart.slice(1);
      updateAdminName.run(first, "Admin", row.id);
    });
  });
  backfill(adminsMissingNames);
}

const existingCustomers = db.prepare("SELECT COUNT(*) AS total FROM customers").get().total;
if (!existingCustomers) {
  const orderCustomers = db
    .prepare(
      `
      SELECT customer_name, customer_phone, MIN(created_at) AS registered_at
      FROM orders
      GROUP BY customer_phone, customer_name
      ORDER BY registered_at ASC
    `
    )
    .all();

  if (orderCustomers.length) {
    const insertCustomer = db.prepare(
      `
      INSERT INTO customers (id, name, phone, registered_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `
    );
    const updateOrdersCustomerId = db.prepare(
      "UPDATE orders SET customer_id = ? WHERE customer_phone = ? AND customer_id IS NULL"
    );

    const migrate = db.transaction((rows) => {
      rows.forEach((row, index) => {
        const customerId = `CUS-${String(index + 1).padStart(4, "0")}`;
        insertCustomer.run(customerId, row.customer_name, row.customer_phone, row.registered_at);
        updateOrdersCustomerId.run(customerId, row.customer_phone);
      });
    });

    migrate(orderCustomers);
  }
}

const ordersWithoutCustomer = db
  .prepare("SELECT DISTINCT customer_phone, customer_name, MIN(created_at) AS registered_at FROM orders WHERE customer_id IS NULL GROUP BY customer_phone, customer_name")
  .all();
if (ordersWithoutCustomer.length) {
  const findCustomerByPhone = db.prepare("SELECT id FROM customers WHERE phone = ?");
  const insertCustomer = db.prepare(
    "INSERT INTO customers (id, name, phone, registered_at, updated_at) VALUES (?, ?, ?, ?, datetime('now'))"
  );
  const attachCustomer = db.prepare(
    "UPDATE orders SET customer_id = ? WHERE customer_phone = ? AND customer_id IS NULL"
  );

  const syncMissing = db.transaction((rows) => {
    rows.forEach((row, index) => {
      let customer = findCustomerByPhone.get(row.customer_phone);
      if (!customer) {
        const customerId = `CUS-${Date.now()}-${index}`;
        insertCustomer.run(customerId, row.customer_name, row.customer_phone, row.registered_at);
        customer = { id: customerId };
      }
      attachCustomer.run(customer.id, row.customer_phone);
    });
  });

  syncMissing(ordersWithoutCustomer);
}

const count = db.prepare("SELECT COUNT(*) AS total FROM products").get().total;
if (!count) {
  const seed = db.prepare(`
    INSERT INTO products (id, name, category, sku, price, stock, description, image, active)
    VALUES (@id, @name, @category, @sku, @price, @stock, @description, @image, @active)
  `);

  const defaults = [
    {
      id: "p-1",
      name: "Paneer Tikka Wrap",
      category: "Snacks",
      sku: "SNK-101",
      price: 220,
      stock: 18,
      description: "Smoky paneer, onion salad, mint chutney in soft wrap.",
      image: "https://images.unsplash.com/photo-1604908177522-3ba8d3f3d31f?auto=format&fit=crop&w=800&q=80",
      active: 1
    },
    {
      id: "p-2",
      name: "Hyderabadi Chicken Biryani",
      category: "Biryani",
      sku: "BRY-201",
      price: 320,
      stock: 22,
      description: "Long-grain rice, saffron aroma, tender chicken pieces.",
      image: "https://images.unsplash.com/photo-1631515243349-e0cb75fb8d3a?auto=format&fit=crop&w=800&q=80",
      active: 1
    },
    {
      id: "p-3",
      name: "Masala Millet Bowl",
      category: "Main Course",
      sku: "MNC-301",
      price: 180,
      stock: 30,
      description: "Protein-rich millet, roasted vegetables, and curry drizzle.",
      image: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=800&q=80",
      active: 1
    },
    {
      id: "p-4",
      name: "Gulab Jamun Cheesecake",
      category: "Desserts",
      sku: "DST-401",
      price: 150,
      stock: 12,
      description: "Creamy cheesecake with warm gulab jamun topping.",
      image: "https://images.unsplash.com/photo-1551024601-bec78aea704b?auto=format&fit=crop&w=800&q=80",
      active: 1
    }
  ];

  const seedMany = db.transaction((rows) => {
    rows.forEach((row) => seed.run(row));
  });

  seedMany(defaults);
}

module.exports = db;
