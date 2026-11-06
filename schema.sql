-- ============================================================================
-- Curevia Pharmacy Management System
-- Database Schema Definition (schema.sql)
-- Tagline: "Precision Care, Verified Deliveries"
-- Engine: MySQL 8.0+ (InnoDB Engine, utf8mb4)
-- ============================================================================

CREATE DATABASE IF NOT EXISTS curevia_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE curevia_db;

-- ----------------------------------------------------------------------------
-- Drop existing views, procedures, triggers, and tables in dependency order
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS view_admin_daily_sales;
DROP VIEW IF EXISTS view_inventory_alerts;
DROP VIEW IF EXISTS view_catalog_display;

DROP PROCEDURE IF EXISTS sp_PlaceOrder;

DROP TRIGGER IF EXISTS trg_after_order_item_insert;
DROP TRIGGER IF EXISTS trg_before_order_item_insert;

DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS prescriptions;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS batch_inventory;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS manufacturers;
DROP TABLE IF EXISTS categories;

-- ============================================================================
-- 1. TABLES DEFINITION (Normalized 3NF, DDL Constraints, InnoDB)
-- ============================================================================

-- Table 1: Categories (Hierarchical Category Tree)
CREATE TABLE categories (
    category_id INT AUTO_INCREMENT PRIMARY KEY,
    category_name VARCHAR(100) NOT NULL UNIQUE,
    parent_id INT NULL,
    description TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_categories_parent
        FOREIGN KEY (parent_id)
        REFERENCES categories(category_id)
        ON DELETE SET NULL
        ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table 2: Manufacturers (Pharmaceutical producers & distributors)
CREATE TABLE manufacturers (
    manufacturer_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    contact_email VARCHAR(100) NULL,
    contact_phone VARCHAR(20) NULL,
    address VARCHAR(255) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table 3: Products (Core drug catalog with Rx requirements and pricing)
CREATE TABLE products (
    product_id INT AUTO_INCREMENT PRIMARY KEY,
    product_name VARCHAR(200) NOT NULL,
    category_id INT NOT NULL,
    manufacturer_id INT NOT NULL,
    requires_prescription BOOLEAN NOT NULL DEFAULT FALSE,
    dosage_form VARCHAR(50) NOT NULL,
    strength VARCHAR(50) NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_products_unit_price CHECK (unit_price >= 0),
    CONSTRAINT fk_products_category
        FOREIGN KEY (category_id)
        REFERENCES categories(category_id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_products_manufacturer
        FOREIGN KEY (manufacturer_id)
        REFERENCES manufacturers(manufacturer_id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table 4: Batch Inventory (Batch-level tracking with strict expiry checks)
CREATE TABLE batch_inventory (
    batch_id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    batch_number VARCHAR(50) NOT NULL UNIQUE,
    manufacturing_date DATE NOT NULL,
    expiry_date DATE NOT NULL,
    stock_quantity INT NOT NULL,
    CONSTRAINT chk_batch_stock CHECK (stock_quantity >= 0),
    CONSTRAINT check_dates CHECK (expiry_date > manufacturing_date),
    CONSTRAINT fk_batch_product
        FOREIGN KEY (product_id)
        REFERENCES products(product_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table 5: Users (Role-based access: Customer, Pharmacist, Admin)
CREATE TABLE users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(120) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    phone_number VARCHAR(15) NULL,
    role ENUM('Customer', 'Pharmacist', 'Admin') NOT NULL DEFAULT 'Customer',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table 6: Prescriptions (Audit trail for uploaded doctor prescriptions)
CREATE TABLE prescriptions (
    prescription_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    doctor_name VARCHAR(100) NOT NULL,
    file_path VARCHAR(255) NOT NULL,
    status ENUM('Pending', 'Approved', 'Rejected') NOT NULL DEFAULT 'Pending',
    verified_by INT NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_prescriptions_user
        FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT fk_prescriptions_verifier
        FOREIGN KEY (verified_by)
        REFERENCES users(user_id)
        ON DELETE SET NULL
        ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table 7: Orders (Core purchasing entity)
CREATE TABLE orders (
    order_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    prescription_id INT NULL,
    total_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    order_status ENUM('Placed', 'Processing', 'Dispatched', 'Delivered', 'Cancelled') NOT NULL DEFAULT 'Placed',
    shipping_address TEXT NOT NULL,
    order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_orders_total CHECK (total_amount >= 0),
    CONSTRAINT fk_orders_user
        FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_orders_prescription
        FOREIGN KEY (prescription_id)
        REFERENCES prescriptions(prescription_id)
        ON DELETE SET NULL
        ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table 8: Order Items (Line items binding specific batches to orders)
CREATE TABLE order_items (
    order_item_id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL,
    product_id INT NOT NULL,
    batch_id INT NOT NULL,
    quantity INT NOT NULL,
    price_at_purchase DECIMAL(10,2) NOT NULL,
    CONSTRAINT chk_order_items_qty CHECK (quantity > 0),
    CONSTRAINT chk_order_items_price CHECK (price_at_purchase >= 0),
    CONSTRAINT fk_order_items_order
        FOREIGN KEY (order_id)
        REFERENCES orders(order_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CONSTRAINT fk_order_items_product
        FOREIGN KEY (product_id)
        REFERENCES products(product_id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE,
    CONSTRAINT fk_order_items_batch
        FOREIGN KEY (batch_id)
        REFERENCES batch_inventory(batch_id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Table 9: Payments (Transaction log linked 1:1 with Orders)
CREATE TABLE payments (
    payment_id INT AUTO_INCREMENT PRIMARY KEY,
    order_id INT NOT NULL UNIQUE,
    payment_method ENUM('UPI', 'Credit Card', 'Debit Card', 'COD') NOT NULL,
    payment_status ENUM('Pending', 'Completed', 'Failed') NOT NULL DEFAULT 'Completed',
    transaction_reference VARCHAR(100) NOT NULL,
    paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_payments_order
        FOREIGN KEY (order_id)
        REFERENCES orders(order_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 2. TRIGGERS (Automated Business Logic & Validation)
-- ============================================================================

DELIMITER $$

-- Trigger 1: Validate Batch Expiry & Stock Before Order Item Insertion
CREATE TRIGGER trg_before_order_item_insert
BEFORE INSERT ON order_items
FOR EACH ROW
BEGIN
    DECLARE v_batch_expiry DATE;
    DECLARE v_batch_stock INT;

    SELECT expiry_date, stock_quantity
    INTO v_batch_expiry, v_batch_stock
    FROM batch_inventory
    WHERE batch_id = NEW.batch_id;

    -- Strict check: Expiry date must be >= CURDATE()
    IF v_batch_expiry < CURDATE() THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Transaction rejected: Cannot dispense expired batch medication.';
    END IF;

    -- Strict check: Available stock must suffice
    IF v_batch_stock < NEW.quantity THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Transaction rejected: Insufficient stock available in selected batch.';
    END IF;
END$$

-- Trigger 2: Automatically Decrement Inventory After Order Item Insertion
CREATE TRIGGER trg_after_order_item_insert
AFTER INSERT ON order_items
FOR EACH ROW
BEGIN
    UPDATE batch_inventory
    SET stock_quantity = stock_quantity - NEW.quantity
    WHERE batch_id = NEW.batch_id;
END$$

DELIMITER ;

-- ============================================================================
-- 3. STORED PROCEDURES (Atomic Order Processing with Locking & Error Rollback)
-- ============================================================================

DELIMITER $$

CREATE PROCEDURE sp_PlaceOrder(
    IN p_user_id INT,
    IN p_prescription_id INT,
    IN p_shipping_address TEXT,
    IN p_product_id INT,
    IN p_batch_id INT,
    IN p_quantity INT,
    OUT p_order_id INT
)
proc_main: BEGIN
    DECLARE v_requires_prescription BOOLEAN DEFAULT FALSE;
    DECLARE v_unit_price DECIMAL(10,2) DEFAULT 0.00;
    DECLARE v_batch_stock INT DEFAULT 0;
    DECLARE v_batch_expiry DATE;
    DECLARE v_batch_product_id INT;
    DECLARE v_rx_status VARCHAR(20);
    DECLARE v_rx_user_id INT;
    DECLARE v_total_amount DECIMAL(10,2) DEFAULT 0.00;
    DECLARE v_created_order_id INT DEFAULT 0;
    DECLARE v_txn_ref VARCHAR(100);

    -- SQLEXCEPTION Handler: Rolls back atomic transaction and resignals error
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    -- Start Atomic Database Transaction
    START TRANSACTION;

    -- Step 1: Validate Product existence & prescription requirement
    SELECT requires_prescription, unit_price
    INTO v_requires_prescription, v_unit_price
    FROM products
    WHERE product_id = p_product_id;

    IF v_unit_price IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Order failed: Specified product does not exist.';
    END IF;

    IF p_quantity <= 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Order failed: Quantity must be greater than zero.';
    END IF;

    -- Step 2: Lock the batch row using SELECT ... FOR UPDATE for concurrency safety
    SELECT product_id, stock_quantity, expiry_date
    INTO v_batch_product_id, v_batch_stock, v_batch_expiry
    FROM batch_inventory
    WHERE batch_id = p_batch_id
    FOR UPDATE;

    IF v_batch_product_id IS NULL OR v_batch_product_id <> p_product_id THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Order failed: Selected batch does not correspond to the requested product.';
    END IF;

    IF v_batch_expiry < CURDATE() THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Transaction rejected: Cannot dispense expired batch medication.';
    END IF;

    IF v_batch_stock < p_quantity THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Order failed: Insufficient batch stock.';
    END IF;

    -- Step 3: Prescription Verification for restricted medications
    IF v_requires_prescription = 1 THEN
        IF p_prescription_id IS NULL OR p_prescription_id <= 0 THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Order failed: Prescription mandatory for this scheduled medication.';
        END IF;

        SELECT status, user_id
        INTO v_rx_status, v_rx_user_id
        FROM prescriptions
        WHERE prescription_id = p_prescription_id;

        IF v_rx_status IS NULL THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Order failed: Provided prescription record does not exist.';
        END IF;

        IF v_rx_user_id <> p_user_id THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Order failed: Prescription does not belong to the ordering user.';
        END IF;

        IF v_rx_status <> 'Approved' THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Order failed: Prescription has not been approved by a licensed pharmacist.';
        END IF;
    END IF;

    -- Step 4: Calculate total price
    SET v_total_amount = v_unit_price * p_quantity;

    -- Step 5: Insert Order record
    INSERT INTO orders (user_id, prescription_id, total_amount, order_status, shipping_address)
    VALUES (p_user_id, p_prescription_id, v_total_amount, 'Placed', p_shipping_address);

    SET v_created_order_id = LAST_INSERT_ID();

    -- Step 6: Insert Order Item (Triggers trg_before_order_item_insert and trg_after_order_item_insert will fire)
    INSERT INTO order_items (order_id, product_id, batch_id, quantity, price_at_purchase)
    VALUES (v_created_order_id, p_product_id, p_batch_id, p_quantity, v_unit_price);

    -- Step 7: Record Payment record
    SET v_txn_ref = CONCAT('PAY-CUR-', LPAD(FLOOR(RAND() * 899999 + 100000), 6, '0'));
    INSERT INTO payments (order_id, payment_method, payment_status, transaction_reference)
    VALUES (v_created_order_id, 'UPI', 'Completed', v_txn_ref);

    -- Commit transaction
    COMMIT;

    -- Return the created order id to caller
    SET p_order_id = v_created_order_id;
END$$

DELIMITER ;

-- ============================================================================
-- 4. ANALYTICAL VIEWS
-- ============================================================================

-- View 1: Catalog display (Aggregates active non-expired batch quantities per product)
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
    COALESCE(SUM(CASE WHEN b.expiry_date >= CURDATE() THEN b.stock_quantity ELSE 0 END), 0) AS total_active_stock,
    COUNT(CASE WHEN b.expiry_date >= CURDATE() AND b.stock_quantity > 0 THEN 1 END) AS available_batches_count,
    MIN(CASE WHEN b.expiry_date >= CURDATE() AND b.stock_quantity > 0 THEN b.expiry_date END) AS earliest_expiry_date
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
    DATEDIFF(b.expiry_date, CURDATE()) AS days_to_expiry,
    b.stock_quantity,
    CASE 
        WHEN b.expiry_date < CURDATE() THEN 'EXPIRED'
        WHEN DATEDIFF(b.expiry_date, CURDATE()) <= 30 THEN 'EXPIRING SOON'
        WHEN b.stock_quantity <= 15 THEN 'LOW STOCK'
        ELSE 'ADEQUATE'
    END AS alert_status,
    CASE 
        WHEN b.expiry_date < CURDATE() THEN 1
        WHEN DATEDIFF(b.expiry_date, CURDATE()) <= 30 THEN 2
        WHEN b.stock_quantity <= 15 THEN 3
        ELSE 4
    END AS alert_priority
FROM batch_inventory b
JOIN products p ON b.product_id = p.product_id
JOIN manufacturers m ON p.manufacturer_id = m.manufacturer_id;

-- View 3: Admin Daily Sales (Daily summary of orders, units sold, and total revenue)
CREATE OR REPLACE VIEW view_admin_daily_sales AS
SELECT 
    DATE(o.order_date) AS sale_date,
    COUNT(DISTINCT o.order_id) AS total_orders,
    COALESCE(SUM(oi.quantity), 0) AS total_units_sold,
    COALESCE(SUM(o.total_amount), 0.00) AS total_revenue,
    COUNT(DISTINCT o.user_id) AS unique_customers
FROM orders o
LEFT JOIN order_items oi ON o.order_id = oi.order_id
WHERE o.order_status <> 'Cancelled'
GROUP BY DATE(o.order_date);

