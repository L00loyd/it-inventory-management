// Integration tests: real HTTP requests -> Express -> the PostgreSQL database in DATABASE_URL.
// Run with:  npm test      (needs DATABASE_URL; creates and removes its own TST- rows)
const test = require("node:test");
const assert = require("node:assert/strict");
const db = require("../db");
const { start } = require("../server");

let server, base;

const json = (method, url, body) =>
  fetch(base + url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body)
  }).then(async res => ({ status: res.status, body: await res.json() }));

const valid = (sku, extra = {}) => ({
  sku, product_name: "Test Item", category: "Monitor", supplier: "Dell Technologies",
  unit_price: "100.50", stock_quantity: "10", reorder_level: "3", ...extra
});

test.before(async () => {
  if (!db.hasConfig) throw new Error("Set DATABASE_URL before running the tests.");
  server = await start(0);
  base = "http://127.0.0.1:" + server.address().port;
  await db.query("DELETE FROM products WHERE sku LIKE 'TST-%'");
});

test.after(async () => {
  await db.query("DELETE FROM products WHERE sku LIKE 'TST-%'");
  await new Promise(resolve => server.close(resolve));
  await db.end();
});

let id; // product created in the CRUD flow below; the tests run in order

test("TC01 health check reaches the database", async () => {
  const r = await json("GET", "/api/health");
  assert.equal(r.status, 200);
  assert.equal(r.body.database, "connected");
});

test("TC02 CREATE returns 201 and the stored record", async () => {
  const r = await json("POST", "/api/products", valid("TST-001"));
  assert.equal(r.status, 201);
  assert.equal(r.body.product.sku, "TST-001");
  assert.equal(r.body.product.unit_price, 100.5);
  assert.equal(r.body.product.stock_status, "In Stock");
  id = r.body.product.product_id;
  assert.ok(Number.isInteger(id));
});

test("TC03 READ returns the new record (list and by id)", async () => {
  const one = await json("GET", "/api/products/" + id);
  assert.equal(one.status, 200);
  assert.equal(one.body.product_name, "Test Item");
  const all = await json("GET", "/api/products");
  assert.equal(all.status, 200);
  assert.ok(all.body.some(p => p.product_id === id));
});

test("TC04 UPDATE changes the row and logs the stock movement", async () => {
  const r = await json("PUT", "/api/products/" + id,
    valid("TST-001", { product_name: "Renamed Item", unit_price: "120", stock_quantity: "2" }));
  assert.equal(r.status, 200);
  assert.equal(r.body.product.product_name, "Renamed Item");
  assert.equal(r.body.product.stock_quantity, 2);
  assert.equal(r.body.product.stock_status, "Low Stock");

  // 10 -> 2 must appear as an OUT movement of 8, after the initial IN of 10.
  const { rows } = await db.query(
    "SELECT transaction_type, quantity_changed FROM stock_transactions WHERE product_id = $1 ORDER BY transaction_id", [id]);
  assert.deepEqual(rows, [
    { transaction_type: "IN", quantity_changed: 10 },
    { transaction_type: "OUT", quantity_changed: 8 }
  ]);

  const again = await json("GET", "/api/products/" + id);   // the change is really stored
  assert.equal(again.body.product_name, "Renamed Item");
});

test("TC05 invalid input is rejected with 400 and not stored", async () => {
  const r = await json("POST", "/api/products",
    valid("bad sku!", { product_name: "", unit_price: "-5", stock_quantity: "1.5" }));
  assert.equal(r.status, 400);
  assert.ok(r.body.details.length >= 4);
  const { rows } = await db.query("SELECT 1 FROM products WHERE sku = 'bad sku!'");
  assert.equal(rows.length, 0);
});

test("TC06 duplicate SKU (any letter case) returns 409", async () => {
  const create = await json("POST", "/api/products", valid("tst-001"));
  assert.equal(create.status, 409);
  const rename = await json("POST", "/api/products", valid("TST-002"));
  const clash = await json("PUT", "/api/products/" + rename.body.product.product_id, valid("TST-001"));
  assert.equal(clash.status, 409);
});

test("TC07 unknown category or supplier returns 400", async () => {
  const r = await json("POST", "/api/products", valid("TST-003", { category: "Spaceship" }));
  assert.equal(r.status, 400);
  assert.match(r.body.details.join(" "), /Unknown category/);
});

test("TC08 malformed id and malformed JSON return 400", async () => {
  assert.equal((await json("GET", "/api/products/abc")).status, 400);
  assert.equal((await json("DELETE", "/api/products/99999999999")).status, 400);
  assert.equal((await json("POST", "/api/products", "{not json")).status, 400);
});

test("TC09 SQL injection text is stored as data, never executed", async () => {
  const r = await json("POST", "/api/products",
    valid("TST-004", { product_name: "x'); DROP TABLE products;--" }));
  assert.equal(r.status, 201);
  const { rows } = await db.query("SELECT count(*)::int AS n FROM products");
  assert.ok(rows[0].n >= 1);                       // table still exists
  assert.equal(r.body.product.product_name, "x'); DROP TABLE products;--");
  // an injection attempt in the SKU is simply an invalid SKU
  assert.equal((await json("POST", "/api/products", valid("' OR 1=1 --"))).status, 400);
});

test("TC10 UPDATE / DELETE / READ of a missing id return 404", async () => {
  assert.equal((await json("PUT", "/api/products/2147483000", valid("TST-005"))).status, 404);
  assert.equal((await json("DELETE", "/api/products/2147483000")).status, 404);
  assert.equal((await json("GET", "/api/products/2147483000")).status, 404);
});

test("TC11 DELETE removes the row and its stock history", async () => {
  const r = await json("DELETE", "/api/products/" + id);
  assert.equal(r.status, 200);
  assert.equal(r.body.product.sku, "TST-001");
  assert.equal((await json("GET", "/api/products/" + id)).status, 404);
  const { rows } = await db.query("SELECT 1 FROM stock_transactions WHERE product_id = $1", [id]);
  assert.equal(rows.length, 0);
});

test("TC12 unknown API route returns 404 JSON", async () => {
  const r = await json("GET", "/api/nothing");
  assert.equal(r.status, 404);
});
