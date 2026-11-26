-- Reference data. Safe to run repeatedly.
INSERT INTO categories (category_name, description) VALUES
    ('Laptop',     'Portable computers'),
    ('Desktop',    'Desktop computers'),
    ('Monitor',    'Display screens'),
    ('Peripheral', 'Keyboards, webcams and other accessories'),
    ('Printer',    'Printers and scanners')
ON CONFLICT (category_name) DO NOTHING;

-- Contact details below are placeholders for demonstration only.
INSERT INTO suppliers (company_name, contact_email, phone_number) VALUES
    ('Dell Technologies', 'sales@dell.example',     '+60-3-0000-0001'),
    ('HP Inc.',           'sales@hp.example',       '+60-3-0000-0002'),
    ('Lenovo',            'sales@lenovo.example',   '+60-3-0000-0003'),
    ('Logitech',          'sales@logitech.example', '+60-3-0000-0004')
ON CONFLICT (company_name) DO NOTHING;
