-- ============================================================================
-- Curevia E-Pharmacy Management System
-- Supabase (PostgreSQL) Schema Definition & Seed Script
-- Official Tagline: "Precision Care, Verified Deliveries"
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. DROP EXISTING OBJECTS (Dependency Order)
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS view_inventory_alerts CASCADE;
DROP VIEW IF EXISTS view_catalog_display CASCADE;
DROP TRIGGER IF EXISTS trg_after_order_item_insert ON order_items;
DROP FUNCTION IF EXISTS fn_deduct_inventory() CASCADE;

DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS prescriptions CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS batch_inventory CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS manufacturers CASCADE;
DROP TABLE IF EXISTS categories CASCADE;

-- ----------------------------------------------------------------------------
-- 2. TABLES DEFINITIONS
-- ----------------------------------------------------------------------------

-- Categories (Hierarchical category tree)
CREATE TABLE categories (
    category_id BIGSERIAL PRIMARY KEY,
    category_name TEXT UNIQUE NOT NULL,
    parent_id BIGINT REFERENCES categories(category_id) ON DELETE SET NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Manufacturers
CREATE TABLE manufacturers (
    manufacturer_id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    contact_email TEXT,
    contact_phone TEXT,
    address TEXT
);

-- Products
CREATE TABLE products (
    product_id BIGSERIAL PRIMARY KEY,
    product_name TEXT NOT NULL,
    category_id BIGINT REFERENCES categories(category_id) ON DELETE RESTRICT,
    manufacturer_id BIGINT REFERENCES manufacturers(manufacturer_id) ON DELETE RESTRICT,
    requires_prescription BOOLEAN DEFAULT FALSE,
    dosage_form TEXT,
    strength TEXT,
    unit_price NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Batch Inventory (Batch lot tracking with check constraints)
CREATE TABLE batch_inventory (
    batch_id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    batch_number TEXT UNIQUE NOT NULL,
    manufacturing_date DATE NOT NULL,
    expiry_date DATE NOT NULL,
    stock_quantity INT NOT NULL CHECK (stock_quantity >= 0),
    CONSTRAINT check_dates CHECK (expiry_date > manufacturing_date)
);

-- Users (Role-based access: Customer, Pharmacist, Admin)
CREATE TABLE users (
    user_id BIGSERIAL PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    phone_number TEXT UNIQUE,
    role TEXT CHECK (role IN ('Customer', 'Pharmacist', 'Admin')) DEFAULT 'Customer',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Prescriptions
CREATE TABLE prescriptions (
    prescription_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    doctor_name TEXT,
    file_path TEXT NOT NULL,
    status TEXT CHECK (status IN ('Pending', 'Approved', 'Rejected')) DEFAULT 'Pending',
    verified_by BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Orders (prescription_id is optional to allow open/unrestricted customer ordering)
CREATE TABLE orders (
    order_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    prescription_id BIGINT REFERENCES prescriptions(prescription_id) ON DELETE SET NULL,
    total_amount NUMERIC(10,2) DEFAULT 0.00 CHECK (total_amount >= 0),
    order_status TEXT DEFAULT 'Placed' CHECK (order_status IN ('Placed', 'Processing', 'Dispatched', 'Delivered', 'Cancelled')),
    shipping_address TEXT NOT NULL,
    order_date TIMESTAMPTZ DEFAULT NOW()
);

-- Order Items
CREATE TABLE order_items (
    order_item_id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products(product_id) ON DELETE RESTRICT,
    batch_id BIGINT NOT NULL REFERENCES batch_inventory(batch_id) ON DELETE RESTRICT,
    quantity INT NOT NULL CHECK (quantity > 0),
    price_at_purchase NUMERIC(10,2) NOT NULL CHECK (price_at_purchase >= 0)
);

-- Payments
CREATE TABLE payments (
    payment_id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL UNIQUE REFERENCES orders(order_id) ON DELETE CASCADE,
    payment_method TEXT NOT NULL,
    payment_status TEXT DEFAULT 'Completed' CHECK (payment_status IN ('Pending', 'Completed', 'Failed')),
    transaction_reference TEXT NOT NULL,
    paid_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 3. AUTOMATED INVENTORY REDUCTION TRIGGER
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_deduct_inventory()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE batch_inventory
    SET stock_quantity = stock_quantity - NEW.quantity
    WHERE batch_id = NEW.batch_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_after_order_item_insert ON order_items;
CREATE TRIGGER trg_after_order_item_insert
AFTER INSERT ON order_items
FOR EACH ROW
EXECUTE FUNCTION fn_deduct_inventory();

-- ----------------------------------------------------------------------------
-- 4. ANALYTICAL VIEWS
-- ----------------------------------------------------------------------------

-- View 1: Catalog Display (Aggregates active non-expired stock per product)
CREATE OR REPLACE VIEW view_catalog_display AS
SELECT 
    p.product_id,
    p.product_name,
    p.dosage_form,
    p.strength,
    p.unit_price,
    p.requires_prescription,
    c.category_id,
    c.category_name,
    m.manufacturer_id,
    m.name AS manufacturer_name,
    COALESCE(SUM(CASE WHEN b.expiry_date >= CURRENT_DATE THEN b.stock_quantity ELSE 0 END), 0)::INT AS total_active_stock,
    COUNT(CASE WHEN b.expiry_date >= CURRENT_DATE AND b.stock_quantity > 0 THEN 1 END)::INT AS available_batches_count,
    MIN(CASE WHEN b.expiry_date >= CURRENT_DATE AND b.stock_quantity > 0 THEN b.expiry_date END) AS earliest_expiry_date
FROM products p
JOIN categories c ON p.category_id = c.category_id
JOIN manufacturers m ON p.manufacturer_id = m.manufacturer_id
LEFT JOIN batch_inventory b ON p.product_id = b.product_id
GROUP BY 
    p.product_id, 
    p.product_name, 
    p.dosage_form, 
    p.strength, 
    p.unit_price, 
    p.requires_prescription, 
    c.category_id, 
    c.category_name, 
    m.manufacturer_id, 
    m.name;

-- View 2: Inventory Alerts (Categorizes batches into EXPIRED, EXPIRING SOON, LOW STOCK, ADEQUATE)
CREATE OR REPLACE VIEW view_inventory_alerts AS
SELECT 
    b.batch_id,
    b.batch_number,
    p.product_id,
    p.product_name,
    p.requires_prescription,
    m.name AS manufacturer_name,
    b.manufacturing_date,
    b.expiry_date,
    (b.expiry_date - CURRENT_DATE)::INT AS days_to_expiry,
    b.stock_quantity,
    CASE 
        WHEN b.expiry_date < CURRENT_DATE THEN 'EXPIRED'
        WHEN (b.expiry_date - CURRENT_DATE) <= 30 THEN 'EXPIRING SOON'
        WHEN b.stock_quantity <= 15 THEN 'LOW STOCK'
        ELSE 'ADEQUATE'
    END AS alert_status,
    CASE 
        WHEN b.expiry_date < CURRENT_DATE THEN 1
        WHEN (b.expiry_date - CURRENT_DATE) <= 30 THEN 2
        WHEN b.stock_quantity <= 15 THEN 3
        ELSE 4
    END AS alert_priority
FROM batch_inventory b
JOIN products p ON b.product_id = p.product_id
JOIN manufacturers m ON p.manufacturer_id = m.manufacturer_id;

-- ----------------------------------------------------------------------------
-- 5. INITIAL SEED DATA
-- ----------------------------------------------------------------------------

-- Categories (aligned with horizontal category bar)
INSERT INTO categories (category_id, category_name, parent_id, description) VALUES
(1, 'General Medicines', NULL, 'Essential daily pharmaceuticals, pain relief, and antipyretics.'),
(2, 'Ayush & Herbal', NULL, 'Traditional ayurvedic supplements, herbal tonics, and natural immunity.'),
(3, 'Fitness & Supplements', NULL, 'Multivitamins, nutritional health supplements, and minerals.'),
(4, 'Medical Devices', NULL, 'High-precision diagnostic equipment, monitors, and test kits.'),
(5, 'Personal Care', NULL, 'Antiseptics, dermatological cleansers, and personal sanitization.'),
(6, 'Diabetes Support', NULL, 'Glycemic control tablets, glucometer strips, and diabetic care essentials.')
ON CONFLICT (category_id) DO NOTHING;

-- Manufacturers
INSERT INTO manufacturers (manufacturer_id, name, contact_email, contact_phone, address) VALUES
(1, 'Sun Pharma Laboratories Ltd', 'contact@sunpharma.com', '+91-22-4324-4324', 'Goregaon (E), Mumbai, MH'),
(2, 'Cipla Ltd', 'reachus@cipla.com', '+91-22-2482-6000', 'Lower Parel, Mumbai, MH'),
(3, 'Dabur India Ltd', 'customercare@dabur.com', '+91-120-3982000', 'Asaf Ali Road, New Delhi, DL'),
(4, 'Dr. Reddy''s Laboratories', 'mail@drreddys.com', '+91-40-4900-2900', 'Banjara Hills, Hyderabad, TS'),
(5, 'Micro Labs Ltd', 'info@microlabs.com', '+91-80-2237-0451', 'Vasanth Nagar, Bangalore, KA')
ON CONFLICT (manufacturer_id) DO NOTHING;

-- Products (10 Core Medicines including Dolo 650, Augmentin, Becosules Z, etc.)
INSERT INTO products (product_id, product_name, category_id, manufacturer_id, requires_prescription, dosage_form, strength, unit_price) VALUES
(1, 'Augmentin 625 Duo Tablet', 1, 1, TRUE, 'Tablet', '625 mg', 204.50),
(2, 'Dolo 650 Paracetamol Tablet', 1, 5, FALSE, 'Tablet', '650 mg', 33.60),
(3, 'Azithral 500mg Tablet', 1, 2, TRUE, 'Tablet', '500 mg', 119.50),
(4, 'Glycomet-500 SR Tablet', 6, 1, TRUE, 'Tablet', '500 mg SR', 45.00),
(5, 'Telma 40mg Tablet', 1, 4, TRUE, 'Tablet', '40 mg', 142.00),
(6, 'Dabur Chyawanprash 2X Immunity', 2, 3, FALSE, 'Paste / Jam', '1 kg Jar', 395.00),
(7, 'Dabur Honitus Herbal Cough Syrup', 2, 3, FALSE, 'Syrup', '100 ml', 105.00),
(8, 'Accu-Chek Active Blood Glucose Strips', 4, 4, FALSE, 'Strips Box', '50 Test Strips', 975.00),
(9, 'Becosules Z Multivitamin Capsules', 3, 2, FALSE, 'Capsule', '20 Capsules', 48.50),
(10, 'Dettol Antiseptic Disinfectant Liquid', 5, 2, FALSE, 'Liquid', '500 ml', 185.00)
ON CONFLICT (product_id) DO NOTHING;

-- Batch Inventory (Includes fresh batches, expiring soon, and low stock)
INSERT INTO batch_inventory (batch_id, product_id, batch_number, manufacturing_date, expiry_date, stock_quantity) VALUES
(1, 1, 'AUG-2025-A1', CURRENT_DATE - INTERVAL '6 month', CURRENT_DATE + INTERVAL '14 month', 120),
(2, 1, 'AUG-2024-URG', CURRENT_DATE - INTERVAL '11 month', CURRENT_DATE + INTERVAL '10 day', 18),
(3, 2, 'DLO-2025-X1', CURRENT_DATE - INTERVAL '3 month', CURRENT_DATE + INTERVAL '22 month', 450),
(4, 3, 'AZI-2025-01', CURRENT_DATE - INTERVAL '4 month', CURRENT_DATE + INTERVAL '18 month', 85),
(5, 3, 'AZI-2023-EXP', CURRENT_DATE - INTERVAL '24 month', CURRENT_DATE - INTERVAL '15 day', 30),
(6, 4, 'GLY-2025-88', CURRENT_DATE - INTERVAL '3 month', CURRENT_DATE + INTERVAL '20 month', 240),
(7, 4, 'GLY-2025-LOW', CURRENT_DATE - INTERVAL '5 month', CURRENT_DATE + INTERVAL '15 month', 8),
(8, 5, 'TEL-2025-C1', CURRENT_DATE - INTERVAL '2 month', CURRENT_DATE + INTERVAL '22 month', 110),
(9, 6, 'CHY-2025-D1', CURRENT_DATE - INTERVAL '2 month', CURRENT_DATE + INTERVAL '22 month', 65),
(10, 7, 'HON-2025-K3', CURRENT_DATE - INTERVAL '3 month', CURRENT_DATE + INTERVAL '15 month', 12),
(11, 8, 'GLU-2025-M9', CURRENT_DATE - INTERVAL '1 month', CURRENT_DATE + INTERVAL '30 month', 90),
(12, 9, 'BCS-2025-V2', CURRENT_DATE - INTERVAL '2 month', CURRENT_DATE + INTERVAL '24 month', 300),
(13, 10, 'DET-2025-X5', CURRENT_DATE - INTERVAL '4 month', CURRENT_DATE + INTERVAL '28 month', 140)
ON CONFLICT (batch_id) DO NOTHING;

-- Users (Customer, Pharmacist, Admin)
-- Passwords hashed using werkzeug.security.generate_password_hash ('curevia2026')
INSERT INTO users (user_id, full_name, email, password_hash, phone_number, role) VALUES
(1, 'Aarav Sharma', 'customer@curevia.com', 'scrypt:32768:8:1$m9lKZaPqjI8k31jN$37cbf8923a48e7186105c305c4ec98f3957ebf0518349247ea719f9570fa3f99dd92994e43e743a12a7a5078ee79ef1c469b6188e404bf078c5ce9d7ae2211bb', '+91-9876543210', 'Customer'),
(2, 'Dr. Sneha Patel', 'pharmacist@curevia.com', 'scrypt:32768:8:1$m9lKZaPqjI8k31jN$37cbf8923a48e7186105c305c4ec98f3957ebf0518349247ea719f9570fa3f99dd92994e43e743a12a7a5078ee79ef1c469b6188e404bf078c5ce9d7ae2211bb', '+91-9811223344', 'Pharmacist'),
(3, 'Debopriyo Admin', 'admin@curevia.com', 'scrypt:32768:8:1$m9lKZaPqjI8k31jN$37cbf8923a48e7186105c305c4ec98f3957ebf0518349247ea719f9570fa3f99dd92994e43e743a12a7a5078ee79ef1c469b6188e404bf078c5ce9d7ae2211bb', '+91-9900112233', 'Admin')
ON CONFLICT (user_id) DO NOTHING;

-- Sample Prescriptions
INSERT INTO prescriptions (prescription_id, user_id, doctor_name, file_path, status, verified_by, uploaded_at) VALUES
(1, 1, 'Dr. Ananya Roy, MD (Pulmonology)', 'uploads/rx_sample_approved.pdf', 'Approved', 2, NOW() - INTERVAL '2 day'),
(2, 1, 'Dr. Vikram Seth, MBBS (General Physician)', 'uploads/rx_sample_pending.pdf', 'Pending', NULL, NOW() - INTERVAL '3 hour'),
(3, 1, 'Dr. Rajiv Menon, DM (Cardiology)', 'uploads/rx_sample_rejected.pdf', 'Rejected', 2, NOW() - INTERVAL '5 day')
ON CONFLICT (prescription_id) DO NOTHING;

-- Reset Sequences to current max id
SELECT setval('categories_category_id_seq', (SELECT MAX(category_id) FROM categories));
SELECT setval('manufacturers_manufacturer_id_seq', (SELECT MAX(manufacturer_id) FROM manufacturers));
SELECT setval('products_product_id_seq', (SELECT MAX(product_id) FROM products));
SELECT setval('batch_inventory_batch_id_seq', (SELECT MAX(batch_id) FROM batch_inventory));
SELECT setval('users_user_id_seq', (SELECT MAX(user_id) FROM users));
SELECT setval('prescriptions_prescription_id_seq', (SELECT MAX(prescription_id) FROM prescriptions));

