-- ============================================================================
-- Curevia Pharmacy Management System
-- Initial Seed Data (seed.sql)
-- Tagline: "Precision Care, Verified Deliveries"
-- ============================================================================

USE curevia_db;

-- ----------------------------------------------------------------------------
-- 1. Insert Categories (Hierarchical Tree)
-- ----------------------------------------------------------------------------
INSERT INTO categories (category_id, category_name, parent_id, description) VALUES
(1, 'Prescription Medicines', NULL, 'Critical medications requiring valid doctor prescriptions for scheduled dispensing.'),
(2, 'Ayush', NULL, 'Traditional ayurvedic, homeopathic, unani, and herbal health solutions.'),
(3, 'Devices & Monitors', NULL, 'Diagnostic equipment, self-care kits, glucometers, and digital thermometers.'),
(4, 'Wellness & Nutrition', NULL, 'Dietary supplements, protein formulations, multivitamins, and immunity boosters.'),
(5, 'Personal Care', NULL, 'Dermatological skincare, oral hygiene, antiseptics, and personal sanitization.');

-- Subcategories under root categories
INSERT INTO categories (category_id, category_name, parent_id, description) VALUES
(6, 'Antibiotics & Anti-Infectives', 1, 'Broad-spectrum antibacterial formulations strictly dispensed under prescription.'),
(7, 'Cardiovascular & Diabetes', 1, 'Chronic therapies for cardiac health, blood pressure, and glycemic maintenance.'),
(8, 'Pain Relief & Analgesics', 1, 'Targeted pain management tablets, NSAIDs, and antipyretics.'),
(9, 'Ayurvedic Tonics & Rasayana', 2, 'Authentic formulations for natural rejuvenation, digestion, and vitality.'),
(10, 'Blood Glucose Meters', 3, 'High-precision blood sugar monitoring devices, strips, and lancets.'),
(11, 'Multivitamins & Minerals', 4, 'Essential daily vitamins, trace minerals, and energy vitality capsules.'),
(12, 'Skin & First Aid', 5, 'Antiseptic cleansers, wound dressings, and topical skin barrier creams.');

-- ----------------------------------------------------------------------------
-- 2. Insert Manufacturers
-- ----------------------------------------------------------------------------
INSERT INTO manufacturers (manufacturer_id, name, contact_email, contact_phone, address) VALUES
(1, 'Sun Pharma Laboratories Ltd', 'contact@sunpharma.com', '+91-22-4324-4324', 'Sun House, CTS No. 201 B/1, Goregaon (E), Mumbai, MH - 400063'),
(2, 'Cipla Ltd', 'reachus@cipla.com', '+91-22-2482-6000', 'Cipla House, Peninsula Business Park, Ganpatrao Kadam Marg, Lower Parel, Mumbai, MH - 400013'),
(3, 'Dabur India Ltd', 'customercare@dabur.com', '+91-120-3982000', '8/3, Asaf Ali Road, New Delhi, DL - 110002'),
(4, 'Dr. Reddy''s Laboratories', 'mail@drreddys.com', '+91-40-4900-2900', '8-2-337, Road No. 3, Banjara Hills, Hyderabad, TS - 500034');

-- ----------------------------------------------------------------------------
-- 3. Insert Products
-- ----------------------------------------------------------------------------
INSERT INTO products (product_id, product_name, category_id, manufacturer_id, requires_prescription, dosage_form, strength, unit_price) VALUES
-- Antibiotics & Anti-Infectives (Prescription Mandatory)
(1, 'Augmentin 625 Duo Tablet', 6, 1, TRUE, 'Tablet', '625 mg', 204.50),
(2, 'Azithral 500mg Tablet', 6, 2, TRUE, 'Tablet', '500 mg', 119.50),

-- Cardiovascular & Diabetes (Prescription Mandatory)
(3, 'Glycomet-500 SR Tablet', 7, 1, TRUE, 'Tablet', '500 mg SR', 45.00),
(4, 'Telma 40mg Tablet', 7, 4, TRUE, 'Tablet', '40 mg', 142.00),

-- Pain Relief (OTC / Non-prescription)
(5, 'Crocin 650 Advance Tablet', 8, 2, FALSE, 'Tablet', '650 mg', 32.50),
(6, 'Combiflam Pain Relief Tablet', 8, 1, FALSE, 'Tablet', '400mg + 325mg', 48.00),

-- Ayush (Herbal & Ayurvedic OTC)
(7, 'Dabur Chyawanprash 2X Immunity', 9, 3, FALSE, 'Paste / Jam', '1 kg Jar', 395.00),
(8, 'Dabur Honitus Herbal Cough Syrup', 9, 3, FALSE, 'Syrup', '100 ml', 105.00),

-- Devices & Monitors
(9, 'Accu-Chek Active Blood Glucose Monitor', 10, 4, FALSE, 'Device Kit', 'Meter + 10 Strips', 1499.00),

-- Wellness & Nutrition
(10, 'Becadexamin Daily Multivitamin', 11, 2, FALSE, 'Capsule', 'Softgel 30s', 52.00),

-- Personal Care & First Aid
(11, 'Dettol Antiseptic Disinfectant Liquid', 12, 2, FALSE, 'Liquid', '500 ml', 185.00);

-- ----------------------------------------------------------------------------
-- 4. Insert Batch Inventory
-- Dynamically calculated relative to CURDATE() so alerts always demonstrate:
-- - EXPIRED (expiry_date < CURDATE())
-- - EXPIRING SOON (DATEDIFF <= 30 days)
-- - LOW STOCK (stock_quantity <= 15)
-- - ADEQUATE (stock_quantity > 15 and fresh)
-- ----------------------------------------------------------------------------
INSERT INTO batch_inventory (batch_id, product_id, batch_number, manufacturing_date, expiry_date, stock_quantity) VALUES
-- Product 1: Augmentin 625 Duo
(1, 1, 'AUG-2025-A1', DATE_SUB(CURDATE(), INTERVAL 6 MONTH), DATE_ADD(CURDATE(), INTERVAL 14 MONTH), 120),
(2, 1, 'AUG-2024-URG', DATE_SUB(CURDATE(), INTERVAL 11 MONTH), DATE_ADD(CURDATE(), INTERVAL 10 DAY), 18), -- EXPIRING SOON (<= 30 days)

-- Product 2: Azithral 500mg
(3, 2, 'AZI-2025-01', DATE_SUB(CURDATE(), INTERVAL 4 MONTH), DATE_ADD(CURDATE(), INTERVAL 18 MONTH), 85),
(4, 2, 'AZI-2023-EXP', DATE_SUB(CURDATE(), INTERVAL 24 MONTH), DATE_SUB(CURDATE(), INTERVAL 15 DAY), 30), -- EXPIRED (Demo alert trigger)

-- Product 3: Glycomet-500 SR
(5, 3, 'GLY-2025-88', DATE_SUB(CURDATE(), INTERVAL 3 MONTH), DATE_ADD(CURDATE(), INTERVAL 20 MONTH), 240),
(6, 3, 'GLY-2025-LOW', DATE_SUB(CURDATE(), INTERVAL 5 MONTH), DATE_ADD(CURDATE(), INTERVAL 15 MONTH), 8), -- LOW STOCK (<= 15)

-- Product 4: Telma 40mg
(7, 4, 'TEL-2025-C1', DATE_SUB(CURDATE(), INTERVAL 2 MONTH), DATE_ADD(CURDATE(), INTERVAL 22 MONTH), 110),

-- Product 5: Crocin 650 Advance
(8, 5, 'CRO-2025-B4', DATE_SUB(CURDATE(), INTERVAL 5 MONTH), DATE_ADD(CURDATE(), INTERVAL 19 MONTH), 300),
(9, 5, 'CRO-2024-EXP', DATE_SUB(CURDATE(), INTERVAL 26 MONTH), DATE_SUB(CURDATE(), INTERVAL 40 DAY), 15), -- EXPIRED

-- Product 6: Combiflam
(10, 6, 'CMB-2025-12', DATE_SUB(CURDATE(), INTERVAL 4 MONTH), DATE_ADD(CURDATE(), INTERVAL 16 MONTH), 175),

-- Product 7: Dabur Chyawanprash
(11, 7, 'CHY-2025-D1', DATE_SUB(CURDATE(), INTERVAL 2 MONTH), DATE_ADD(CURDATE(), INTERVAL 22 MONTH), 65),

-- Product 8: Dabur Honitus
(12, 8, 'HON-2025-K3', DATE_SUB(CURDATE(), INTERVAL 3 MONTH), DATE_ADD(CURDATE(), INTERVAL 15 MONTH), 12), -- LOW STOCK (<= 15)

-- Product 9: Accu-Chek Active
(13, 9, 'GLU-2025-M9', DATE_SUB(CURDATE(), INTERVAL 1 MONTH), DATE_ADD(CURDATE(), INTERVAL 36 MONTH), 45),

-- Product 10: Becadexamin
(14, 10, 'BEC-2025-P2', DATE_SUB(CURDATE(), INTERVAL 3 MONTH), DATE_ADD(CURDATE(), INTERVAL 21 MONTH), 190),

-- Product 11: Dettol Antiseptic
(15, 11, 'DET-2025-X5', DATE_SUB(CURDATE(), INTERVAL 4 MONTH), DATE_ADD(CURDATE(), INTERVAL 28 MONTH), 140),
(16, 11, 'DET-2024-URG', DATE_SUB(CURDATE(), INTERVAL 12 MONTH), DATE_ADD(CURDATE(), INTERVAL 12 DAY), 6); -- EXPIRING SOON & LOW STOCK

-- ----------------------------------------------------------------------------
-- 5. Insert Users (Password: 'curevia2026' or 'password123' bcrypt/pbkdf2 hash)
-- Werkzeug pbkdf2:sha256 format for: 'curevia2026'
-- ----------------------------------------------------------------------------
INSERT INTO users (user_id, full_name, email, password_hash, phone_number, role) VALUES
(1, 'Aarav Sharma', 'customer@curevia.com', 'pbkdf2:sha256:600000$tQ0mUe0H$67fdf8bf2f7ebce1b2383842c3858022d8e411b5ffbfeb7f59d5718a287fa4be', '+91-9876543210', 'Customer'),
(2, 'Dr. Sneha Patel (Reg. Pharmacist)', 'pharmacist@curevia.com', 'pbkdf2:sha256:600000$tQ0mUe0H$67fdf8bf2f7ebce1b2383842c3858022d8e411b5ffbfeb7f59d5718a287fa4be', '+91-9811223344', 'Pharmacist'),
(3, 'Debopriyo Admin', 'admin@curevia.com', 'pbkdf2:sha256:600000$tQ0mUe0H$67fdf8bf2f7ebce1b2383842c3858022d8e411b5ffbfeb7f59d5718a287fa4be', '+91-9900112233', 'Admin');

-- ----------------------------------------------------------------------------
-- 6. Insert Prescriptions
-- ----------------------------------------------------------------------------
INSERT INTO prescriptions (prescription_id, user_id, doctor_name, file_path, status, verified_by, uploaded_at) VALUES
(1, 1, 'Dr. Ananya Roy, MD (Pulmonology)', 'uploads/rx_sample_approved.pdf', 'Approved', 2, DATE_SUB(NOW(), INTERVAL 2 DAY)),
(2, 1, 'Dr. Vikram Seth, MBBS (General Physician)', 'uploads/rx_sample_pending.pdf', 'Pending', NULL, DATE_SUB(NOW(), INTERVAL 3 HOUR)),
(3, 1, 'Dr. Rajiv Menon, DM (Cardiology)', 'uploads/rx_sample_rejected.pdf', 'Rejected', 2, DATE_SUB(NOW(), INTERVAL 5 DAY));

-- ----------------------------------------------------------------------------
-- 7. Insert Historical Orders, Order Items, and Payments for Analytics
-- ----------------------------------------------------------------------------
-- Order 1: Placed 2 days ago (Approved Rx antibiotic purchase)
INSERT INTO orders (order_id, user_id, prescription_id, total_amount, order_status, shipping_address, order_date) VALUES
(101, 1, 1, 409.00, 'Delivered', 'Flat 402, Green Glen Heights, Outer Ring Road, Bangalore - 560103', DATE_SUB(NOW(), INTERVAL 2 DAY));

INSERT INTO order_items (order_item_id, order_id, product_id, batch_id, quantity, price_at_purchase) VALUES
(1001, 101, 1, 1, 2, 204.50);

INSERT INTO payments (payment_id, order_id, payment_method, payment_status, transaction_reference, paid_at) VALUES
(501, 101, 'UPI', 'Completed', 'PAY-CUR-982143', DATE_SUB(NOW(), INTERVAL 2 DAY));

-- Order 2: Placed 1 day ago (OTC Wellness order)
INSERT INTO orders (order_id, user_id, prescription_id, total_amount, order_status, shipping_address, order_date) VALUES
(102, 1, NULL, 500.00, 'Dispatched', 'Flat 402, Green Glen Heights, Outer Ring Road, Bangalore - 560103', DATE_SUB(NOW(), INTERVAL 1 DAY));

INSERT INTO order_items (order_item_id, order_id, product_id, batch_id, quantity, price_at_purchase) VALUES
(1002, 102, 7, 11, 1, 395.00),
(1003, 102, 8, 12, 1, 105.00);

INSERT INTO payments (payment_id, order_id, payment_method, payment_status, transaction_reference, paid_at) VALUES
(502, 102, 'Credit Card', 'Completed', 'PAY-CUR-771204', DATE_SUB(NOW(), INTERVAL 1 DAY));

-- Order 3: Placed today (Diagnostic Device order)
INSERT INTO orders (order_id, user_id, prescription_id, total_amount, order_status, shipping_address, order_date) VALUES
(103, 1, NULL, 1551.00, 'Processing', 'Flat 402, Green Glen Heights, Outer Ring Road, Bangalore - 560103', NOW());

INSERT INTO order_items (order_item_id, order_id, product_id, batch_id, quantity, price_at_purchase) VALUES
(1004, 103, 9, 13, 1, 1499.00),
(1005, 103, 10, 14, 1, 52.00);

INSERT INTO payments (payment_id, order_id, payment_method, payment_status, transaction_reference, paid_at) VALUES
(503, 103, 'UPI', 'Completed', 'PAY-CUR-330198', NOW());

