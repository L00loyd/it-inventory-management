# IT Inventory Management

Node.js + Express API with a plain HTML/CSS/JavaScript front end, backed by a
**cloud PostgreSQL database**. Supports full CRUD on products.

## Data model (Task 1)

`categories` 1—N `products` N—1 `suppliers`, and `products` 1—N `stock_transactions`.
The tables are created automatically on start-up from `db/schema.sql`.

## API

| Operation | Method and path | Success | Errors |
|-----------|-----------------|---------|--------|
| Create | `POST /api/products` | 201 + product | 400 invalid input, 409 duplicate SKU |
| Read all | `GET /api/products` | 200 + array | |
| Read one | `GET /api/products/:id` | 200 + product | 400 bad id, 404 not found |
| Update | `PUT /api/products/:id` | 200 + product | 400, 404, 409 |
| Delete | `DELETE /api/products/:id` | 200 + deleted product | 400, 404 |
| Health | `GET /api/health` | 200 `{database:"connected"}` | 503 database down |

Body for POST/PUT (JSON): `sku, product_name, category, supplier, unit_price, stock_quantity, reorder_level`.
Category and supplier are sent by name and must already exist. PUT replaces all fields.
A stock quantity change is logged in `stock_transactions` (IN / OUT). Deleting a product
also deletes its stock history.

## Cloud database setup

1. Create a PostgreSQL database in the cloud (AWS RDS for PostgreSQL as in Task 2, or a free
   service such as Neon, Supabase or Render Postgres) and copy its connection string.
2. Make sure the database accepts connections from where the app runs (security group /
   allowed IPs). Never make a database open to everyone for longer than a short test.
3. Local run:
   ```
   cp .env.example .env      # then put your DATABASE_URL in .env
   npm install
   npm start                 # tables are created on first start
   ```
4. Render: **Environment** tab -> add `DATABASE_URL` (secret). Build command `npm install`,
   start command `npm start`. Redeploy.

### TLS

Connections to remote databases use TLS with certificate checking. If the provider's
certificate is not trusted by Node (AWS RDS needs its own CA bundle), you get a
"self-signed certificate" error: set `DATABASE_SSL=no-verify` (still encrypted, but the server
identity is not checked). For a local database set `DATABASE_SSL=false`.

## Tests and evidence

```
npm test                                   # 12 integration tests against DATABASE_URL
./scripts/crud-demo.sh https://YOUR-APP    # prints each CRUD call with its HTTP status
```
`db/evidence-queries.sql` has SELECT statements to screenshot the stored records.
The tests only touch rows whose SKU starts with `TST-`, but run them against a test
database rather than production data.
