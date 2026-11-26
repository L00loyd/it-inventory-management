require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

/*
 * Cloud PostgreSQL connection.
 * The connection string comes ONLY from the DATABASE_URL environment variable,
 * so no credentials are stored in the code or in Git.
 *
 * DATABASE_SSL controls transport encryption:
 *   (unset)    TLS with certificate checking for remote hosts, off for localhost
 *   "verify"   TLS with certificate checking
 *   "no-verify" TLS without certificate checking (some managed databases, e.g.
 *              AWS RDS, need their CA bundle for "verify"; see README)
 *   "false"    no TLS (local development only)
 */
function buildConfig() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return null;

  const url = new URL(raw);
  const mode = (process.env.DATABASE_SSL || "").toLowerCase();
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);

  // Let DATABASE_SSL decide, not a sslmode flag hidden inside the URL.
  url.searchParams.delete("sslmode");

  let ssl;
  if (mode === "false" || (!mode && isLocal)) ssl = false;
  else if (mode === "no-verify") ssl = { rejectUnauthorized: false };
  else ssl = { rejectUnauthorized: true };

  return {
    connectionString: url.toString(),
    ssl,
    max: Number(process.env.DB_POOL_MAX) || 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  };
}

const config = buildConfig();
const pool = config ? new Pool(config) : null;

// An idle connection can be dropped by the cloud provider; don't crash on it.
if (pool) pool.on("error", err => console.error("Idle database client error:", err.message));

function requirePool() {
  if (!pool) throw new Error("DATABASE_URL is not set. See README.md, section 'Cloud database setup'.");
  return pool;
}

const sql = file => fs.readFileSync(path.join(__dirname, "db", file), "utf8");

// Create the tables if they do not exist yet and load the reference data.
async function initDatabase() {
  const db = requirePool();
  const { rows } = await db.query("SELECT to_regclass('public.products') AS t");
  const firstRun = rows[0].t === null;

  await db.query(sql("schema.sql"));
  await db.query(sql("seed.sql"));
  if (firstRun) await db.query(sql("seed-demo-products.sql"));
  return { firstRun };
}

module.exports = {
  query: (text, params) => requirePool().query(text, params),
  connect: () => requirePool().connect(),
  initDatabase,
  end: () => (pool ? pool.end() : Promise.resolve()),
  hasConfig: Boolean(pool)
};
