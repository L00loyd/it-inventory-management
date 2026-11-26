const express = require("express");
const path = require("path");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname, "public")));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Products are stored with category_id / supplier_id (Task 1 data model), but the
// API keeps using names so the front end and the Task 3 examples do not change.
const PRODUCT_SELECT = `
  SELECT p.product_id, p.sku, p.product_name,
         c.category_name AS category,
         s.company_name  AS supplier,
         p.unit_price::float8 AS unit_price,
         p.stock_quantity, p.reorder_level
  FROM products p
  JOIN categories c ON c.category_id = p.category_id
  JOIN suppliers  s ON s.supplier_id = p.supplier_id`;

function withStatus(p) {
  const stock_status =
    p.stock_quantity <= 0 ? "Out of Stock" :
    p.stock_quantity <= p.reorder_level ? "Low Stock" : "In Stock";
  return { ...p, stock_status };
}

// Wrap async handlers so a rejected promise reaches the error handler.
const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

// Validate the request body; used by both POST (create) and PUT (update).
function readProduct(body) {
  const b = body || {};
  const v = {
    sku: String(b.sku ?? "").trim(),
    name: String(b.product_name ?? "").trim(),
    category: String(b.category ?? "").trim(),
    supplier: String(b.supplier ?? "").trim(),
    price: Number(b.unit_price),
    qty: Number(b.stock_quantity),
    reorder: Number(b.reorder_level)
  };

  const errors = [];
  if (!/^[A-Za-z0-9-]{3,20}$/.test(v.sku)) errors.push("SKU must be 3-20 letters, numbers or hyphens.");
  if (!v.name || v.name.length > 100) errors.push("Product name is required (max 100 characters).");
  if (!v.category) errors.push("Category is required.");
  if (!v.supplier) errors.push("Supplier is required.");
  if (b.unit_price === "" || b.unit_price == null || !Number.isFinite(v.price) || v.price < 0 || v.price > 99999999.99)
    errors.push("Unit price must be 0 or more.");
  if (b.stock_quantity === "" || b.stock_quantity == null || !Number.isInteger(v.qty) || v.qty < 0 || v.qty > 1000000000)
    errors.push("Stock quantity must be a whole number >= 0.");
  if (b.reorder_level === "" || b.reorder_level == null || !Number.isInteger(v.reorder) || v.reorder < 0 || v.reorder > 1000000000)
    errors.push("Reorder level must be a whole number >= 0.");
  return { v, errors };
}

// Parse :id. Returns null when it is not a usable PostgreSQL INT.
function readId(param) {
  if (!/^\d{1,10}$/.test(param)) return null;
  const id = Number(param);
  return id >= 1 && id <= 2147483647 ? id : null;
}

// Look up category_id and supplier_id from their names (inside a transaction).
async function lookupIds(client, v) {
  const [cat, sup] = await Promise.all([
    client.query("SELECT category_id FROM categories WHERE category_name = $1", [v.category]),
    client.query("SELECT supplier_id FROM suppliers WHERE company_name = $1", [v.supplier])
  ]);
  const errors = [];
  if (!cat.rowCount) errors.push("Unknown category.");
  if (!sup.rowCount) errors.push("Unknown supplier.");
  return { errors, categoryId: cat.rows[0]?.category_id, supplierId: sup.rows[0]?.supplier_id };
}

async function logStock(client, productId, type, quantity) {
  await client.query(
    "INSERT INTO stock_transactions (product_id, transaction_type, quantity_changed) VALUES ($1, $2, $3)",
    [productId, type, quantity]
  );
}

// Run fn inside BEGIN / COMMIT, rolling back on any error.
async function inTransaction(fn) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

const UNIQUE_VIOLATION = "23505";
const duplicateSku = res => res.status(409).json({ error: "This SKU already exists." });

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Health check: proves the app can reach the cloud database.
app.get("/api/health", wrap(async (req, res) => {
  await db.query("SELECT 1");
  res.json({ status: "ok", database: "connected" });
}));

// READ (all): GET /api/products
app.get("/api/products", wrap(async (req, res) => {
  const { rows } = await db.query(PRODUCT_SELECT + " ORDER BY p.product_id DESC");
  res.json(rows.map(withStatus));
}));

// READ (one): GET /api/products/:id
app.get("/api/products/:id", wrap(async (req, res) => {
  const id = readId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid product id." });

  const { rows } = await db.query(PRODUCT_SELECT + " WHERE p.product_id = $1", [id]);
  if (!rows.length) return res.status(404).json({ error: "Product not found." });
  res.json(withStatus(rows[0]));
}));

// CREATE: POST /api/products
app.post("/api/products", wrap(async (req, res) => {
  const { v, errors } = readProduct(req.body);
  if (errors.length) return res.status(400).json({ error: "Validation failed.", details: errors });

  const result = await inTransaction(async client => {
    const ids = await lookupIds(client, v);
    if (ids.errors.length) return { invalid: ids.errors };

    const { rows } = await client.query(
      `INSERT INTO products (category_id, supplier_id, sku, product_name, unit_price, stock_quantity, reorder_level)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING product_id`,
      [ids.categoryId, ids.supplierId, v.sku, v.name, v.price, v.qty, v.reorder]
    );
    const productId = rows[0].product_id;
    if (v.qty > 0) await logStock(client, productId, "IN", v.qty);

    const created = await client.query(PRODUCT_SELECT + " WHERE p.product_id = $1", [productId]);
    return { product: created.rows[0] };
  }).catch(err => (err.code === UNIQUE_VIOLATION ? { duplicate: true } : Promise.reject(err)));

  if (result.duplicate) return duplicateSku(res);
  if (result.invalid) return res.status(400).json({ error: "Validation failed.", details: result.invalid });
  res.status(201).json({ message: "Product created.", product: withStatus(result.product) });
}));

// UPDATE: PUT /api/products/:id (replaces all editable fields of one product)
app.put("/api/products/:id", wrap(async (req, res) => {
  const id = readId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid product id." });

  const { v, errors } = readProduct(req.body);
  if (errors.length) return res.status(400).json({ error: "Validation failed.", details: errors });

  const result = await inTransaction(async client => {
    // Lock the row so two edits cannot overwrite each other's stock change.
    const current = await client.query("SELECT stock_quantity FROM products WHERE product_id = $1 FOR UPDATE", [id]);
    if (!current.rowCount) return { notFound: true };

    const ids = await lookupIds(client, v);
    if (ids.errors.length) return { invalid: ids.errors };

    await client.query(
      `UPDATE products
       SET category_id = $1, supplier_id = $2, sku = $3, product_name = $4,
           unit_price = $5, stock_quantity = $6, reorder_level = $7
       WHERE product_id = $8`,
      [ids.categoryId, ids.supplierId, v.sku, v.name, v.price, v.qty, v.reorder, id]
    );

    // A change in stock quantity is recorded as an IN or OUT movement.
    const change = v.qty - current.rows[0].stock_quantity;
    if (change !== 0) await logStock(client, id, change > 0 ? "IN" : "OUT", Math.abs(change));

    const updated = await client.query(PRODUCT_SELECT + " WHERE p.product_id = $1", [id]);
    return { product: updated.rows[0] };
  }).catch(err => (err.code === UNIQUE_VIOLATION ? { duplicate: true } : Promise.reject(err)));

  if (result.notFound) return res.status(404).json({ error: "Product not found." });
  if (result.duplicate) return duplicateSku(res);
  if (result.invalid) return res.status(400).json({ error: "Validation failed.", details: result.invalid });
  res.json({ message: "Product updated.", product: withStatus(result.product) });
}));

// DELETE: DELETE /api/products/:id (its stock history is deleted with it)
app.delete("/api/products/:id", wrap(async (req, res) => {
  const id = readId(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid product id." });

  const { rows } = await db.query(
    "DELETE FROM products WHERE product_id = $1 RETURNING product_id, sku, product_name", [id]
  );
  if (!rows.length) return res.status(404).json({ error: "Product not found." });
  res.json({ message: "Product deleted.", product: rows[0] });
}));

app.use("/api", (req, res) => res.status(404).json({ error: "Not found." }));

// ---------------------------------------------------------------------------
// Error handling: never send stack traces or SQL details to the client.
// ---------------------------------------------------------------------------
const DB_DOWN = new Set(["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "57P01", "57P03"]);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Request body is not valid JSON." });
  if (err.type === "entity.too.large") return res.status(413).json({ error: "Request body is too large." });

  console.error(req.method, req.originalUrl, "-", err.code || "", err.message);
  if (DB_DOWN.has(err.code) || /timeout|terminated/i.test(err.message))
    return res.status(503).json({ error: "Database is temporarily unavailable." });
  res.status(500).json({ error: "Internal server error." });
});

// ---------------------------------------------------------------------------
// Start-up
// ---------------------------------------------------------------------------
async function start(port = PORT) {
  const { firstRun } = await db.initDatabase();
  console.log(firstRun ? "Database created and seeded." : "Database ready.");
  return new Promise(resolve => {
    const server = app.listen(port, () => {
      console.log("Running on http://localhost:" + server.address().port);
      resolve(server);
    });
  });
}

if (require.main === module) {
  start().catch(err => {
    console.error("Could not start:", err.message);
    process.exit(1);
  });
}

module.exports = { app, start };
