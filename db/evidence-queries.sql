-- Paste these into your cloud database's SQL editor / psql to capture
-- "database records" screenshots for the report (Task 4 evidence).

-- 1. Tables that exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;

-- 2. READ: products with their category and supplier (JOIN across the foreign keys)
SELECT p.product_id, p.sku, p.product_name, c.category_name, s.company_name,
       p.unit_price, p.stock_quantity, p.reorder_level
FROM products p
JOIN categories c ON c.category_id = p.category_id
JOIN suppliers  s ON s.supplier_id = p.supplier_id
ORDER BY p.product_id;

-- 3. Stock history written by CREATE / UPDATE
SELECT t.transaction_id, p.sku, t.transaction_type, t.quantity_changed, t.transaction_date
FROM stock_transactions t
JOIN products p ON p.product_id = t.product_id
ORDER BY t.transaction_id;

-- 4. Row counts
SELECT (SELECT count(*) FROM categories)         AS categories,
       (SELECT count(*) FROM suppliers)          AS suppliers,
       (SELECT count(*) FROM products)           AS products,
       (SELECT count(*) FROM stock_transactions) AS stock_transactions;
