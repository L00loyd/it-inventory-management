-- IT Inventory Management: PostgreSQL schema (matches the Task 1 data model).
-- Safe to run more than once: every statement uses IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS categories (
    category_id    SERIAL PRIMARY KEY,
    category_name  VARCHAR(50) NOT NULL UNIQUE,
    description    TEXT
);

CREATE TABLE IF NOT EXISTS suppliers (
    supplier_id    SERIAL PRIMARY KEY,
    company_name   VARCHAR(100) NOT NULL UNIQUE,
    contact_email  VARCHAR(100),
    phone_number   VARCHAR(30)
);

CREATE TABLE IF NOT EXISTS products (
    product_id      SERIAL PRIMARY KEY,
    category_id     INT NOT NULL REFERENCES categories (category_id),
    supplier_id     INT NOT NULL REFERENCES suppliers (supplier_id),
    sku             VARCHAR(20)  NOT NULL,
    product_name    VARCHAR(100) NOT NULL,
    unit_price      NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
    stock_quantity  INT NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    reorder_level   INT NOT NULL DEFAULT 0 CHECK (reorder_level >= 0)
);

-- SKU must be unique, ignoring upper/lower case (same rule the API enforces).
CREATE UNIQUE INDEX IF NOT EXISTS products_sku_lower_key ON products (LOWER(sku));
CREATE INDEX IF NOT EXISTS products_category_idx ON products (category_id);
CREATE INDEX IF NOT EXISTS products_supplier_idx ON products (supplier_id);

-- Every stock change is logged here. Rows are removed with their product.
CREATE TABLE IF NOT EXISTS stock_transactions (
    transaction_id    SERIAL PRIMARY KEY,
    product_id        INT NOT NULL REFERENCES products (product_id) ON DELETE CASCADE,
    transaction_type  VARCHAR(3) NOT NULL CHECK (transaction_type IN ('IN', 'OUT')),
    quantity_changed  INT NOT NULL CHECK (quantity_changed > 0),
    transaction_date  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS stock_tx_product_idx ON stock_transactions (product_id);
