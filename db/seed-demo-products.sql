-- Demo products. Only loaded the first time the schema is created.
INSERT INTO products (category_id, supplier_id, sku, product_name, unit_price, stock_quantity, reorder_level)
SELECT c.category_id, s.supplier_id, v.sku, v.product_name, v.unit_price, v.stock_quantity, v.reorder_level
FROM (VALUES
    (1, 'DL-LAT-5440', 'Dell Latitude 5440',    'Laptop',     'Dell Technologies', 4299.00, 12,  5),
    (2, 'HP-PD-400',   'HP ProDesk 400 G9',     'Desktop',    'HP Inc.',           3199.00,  4,  5),
    (3, 'LN-TP-E14',   'Lenovo ThinkPad E14',   'Laptop',     'Lenovo',            3599.00,  0,  3),
    (4, 'LG-C920',     'Logitech C920 Webcam',  'Peripheral', 'Logitech',           279.00, 25, 10)
) AS v (ord, sku, product_name, category_name, company_name, unit_price, stock_quantity, reorder_level)
JOIN categories c ON c.category_name = v.category_name
JOIN suppliers  s ON s.company_name  = v.company_name
ORDER BY v.ord
ON CONFLICT DO NOTHING;

-- Opening stock is logged as an IN movement.
INSERT INTO stock_transactions (product_id, transaction_type, quantity_changed)
SELECT product_id, 'IN', stock_quantity FROM products WHERE stock_quantity > 0;
