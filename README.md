# Curevia — E-Pharmacy Management System
> **"Precision Care, Verified Deliveries"**

![Curevia Brand Logo](/static/img/logo.png)

A production-ready, full-stack E-Pharmacy Management System built with a Netmeds-inspired design philosophy. Developed for academic DBMS evaluation and production-grade pharmaceutical workflows, featuring strict 3NF database normalization, transactional concurrency controls, stored procedures, automated database triggers, and analytical views.

---

## 1. Brand Identity & Visual Design System

- **Brand Wordmark:** **Curevia** (Rendered in Dark Forest Green `#064E3B`)
- **Official Tagline:** *Precision Care, Verified Deliveries* (`text-xs text-emerald-800/80 font-medium tracking-wide`)
- **Visual Design Rules:**
  - **Canvas & Shells:** Pure Crisp White (`#FFFFFF`) for background canvases, modals, cards, and slide-over drawers.
  - **Dark Forest Green (`#064E3B` / `#065F46`):** Primary branding, verified prescription indicators, in-stock badges, active navigation underlines, and order confirmation CTAs.
  - **Bright Red (`#DC2626` / `#EF4444`):** Prescription mandatory badges (`Rx`), urgent expiry notifications, out-of-stock warnings, cart counter pill, and pharmacist rejection actions.
  - **Micro-Interactions:** Smooth 200ms cubic transitions, button scale compression (`active:scale-[0.98]`), drawer animations, and toast notification engine.

---

## 2. System Architecture & Tech Stack

```
curevia/
├── schema.sql           # MySQL 8.0 DDL (Tables, Constraints, Triggers, SP, Views)
├── seed.sql             # Comprehensive seed data with live-calculated dates
├── db.py                # Raw PyMySQL connection and query execution driver
├── app.py               # Flask RESTful API and SSR routing engine
├── setup_db.py          # Automated CLI installer for database and seed data
├── requirements.txt     # Python dependencies
├── .env.example         # Environment template
├── static/
│   ├── img/
│   │   └── logo.png     # Official Curevia Brand Logo
│   ├── css/
│   │   └── styles.css   # Custom typography, animations, and print invoice styles
│   ├── js/
│   │   ├── api.js       # Centralized Fetch wrapper with error handling
│   │   ├── store.js     # Cart state, batch selector, and catalog engine
│   │   ├── pharmacist.js# Rx review desk and batch vigilance alerts
│   │   └── app.js       # UI bootstrapper, health check, and toast engine
│   └── uploads/         # Local secure storage for uploaded doctor prescriptions
└── templates/
    ├── base.html        # Shared white-canvas layout, header, drawer & modals
    ├── index.html       # Customer Storefront (Pills, Search, Rx badge, Add to Cart)
    ├── pharmacist.html  # Pharmacist Control Desk (Rx queue, Add Batch, Expiry table)
    └── admin.html       # Executive Analytics Dashboard (Sales view, Top 5, Trigger test)
```

- **Database:** MySQL 8.0+ (InnoDB Engine) with foreign keys (`CASCADE` / `RESTRICT` / `SET NULL`), `CHECK` constraints, Triggers, Stored Procedures, and Analytical Views.
- **Backend:** Python (Flask) executing raw, parameterized SQL queries via `PyMySQL` (Zero ORM abstractions).
- **Frontend:** Responsive SPA interface styled with modern Tailwind CSS CDN, FontAwesome 6, and modular Vanilla ES6 JavaScript.

---

## 3. Database Specification & DBMS Artifacts

### A. Normalized Tables (InnoDB, utf8mb4)
1. `categories`: Hierarchical category tree with self-referencing `parent_id`.
2. `manufacturers`: Certified pharmaceutical companies (Sun Pharma, Cipla, Dabur, Dr. Reddy's).
3. `products`: Core drug catalog with unit pricing and `requires_prescription` flags.
4. `batch_inventory`: Batch-level lot tracking with `CHECK (expiry_date > manufacturing_date)` and `CHECK (stock_quantity >= 0)`.
5. `users`: Role-based access control (`Customer`, `Pharmacist`, `Admin`).
6. `prescriptions`: Uploaded doctor slips with audit lifecycle (`Pending`, `Approved`, `Rejected`) and verifier foreign keys.
7. `orders`: Purchasing transactions linked to customers and optional approved prescriptions.
8. `order_items`: Line items binding orders directly to specific medication batches.
9. `payments`: Payment audit trail supporting UPI, Credit Card, Debit Card, and COD.

### B. Database Triggers
- **`trg_before_order_item_insert`**:
  - Validates `batch_inventory.expiry_date >= CURDATE()`.
  - If expired, raises `SQLSTATE '45000'` with message:
    > `Transaction rejected: Cannot dispense expired batch medication.`
  - Validates batch stock availability before insertion.
- **`trg_after_order_item_insert`**:
  - Automatically decrements `batch_inventory.stock_quantity` by `NEW.quantity`.

### C. Stored Procedure: `sp_PlaceOrder`
- Parameters: `(p_user_id, p_prescription_id, p_shipping_address, p_product_id, p_batch_id, p_quantity, OUT p_order_id)`
- Starts atomic transaction with `START TRANSACTION`.
- Locks the selected batch using `SELECT ... FOR UPDATE` to avoid race conditions.
- Validates prescription requirements: if medication requires Rx, confirms prescription exists, belongs to the purchasing user, and has `status = 'Approved'`.
- Inserts order, fires triggers via `order_items`, logs payment reference, and executes `COMMIT`.
- Includes `DECLARE EXIT HANDLER FOR SQLEXCEPTION` with automatic `ROLLBACK` and `RESIGNAL`.

### D. Analytical Views
- **`view_catalog_display`**: Aggregates active non-expired stock quantities, available batch counts, and earliest expiry dates.
- **`view_inventory_alerts`**: Categorizes batches into `EXPIRED`, `EXPIRING SOON` (&le; 30 days), `LOW STOCK` (&le; 15 units), or `ADEQUATE`.
- **`view_admin_daily_sales`**: Daily summary of order volumes, units sold, and total revenue.

---

## 4. Setup & Quick Start Guide

### Step 1: Clone & Configure Environment
Ensure Python and MySQL Server 8.0 are installed on your machine.
```bash
# Copy environment configuration
cp .env.example .env
```
Edit `.env` if your MySQL root credentials differ (e.g. `DB_PASSWORD=your_password`).

### Step 2: Initialize Database Schema & Seed Data
You can initialize the database using either the MySQL CLI or the included setup utility:

**Option A — Using MySQL CLI:**
```bash
mysql -u root -p < schema.sql
mysql -u root -p < seed.sql
```

**Option B — Using Python Setup Script:**
```bash
python setup_db.py
```

### Step 3: Run the Application
```bash
# Activate virtual environment if using venv
.venv\Scripts\activate   # On Windows
source .venv/bin/activate # On Linux/macOS

# Install dependencies (if not already installed)
pip install -r requirements.txt

# Start Flask server
python app.py
```
Open your browser and navigate to:
**`http://127.0.0.1:5000`**

---

## 5. Demonstration & Evaluation Scenarios

### Scenario 1: Prescription-Restricted Medication Flow
1. Visit the Storefront at `http://127.0.0.1:5000`.
2. Notice the bright red **"Rx Required"** tag on **Augmentin 625 Duo** or **Azithral 500mg**.
3. Add Augmentin to your cart and open the cart drawer.
4. The system detects the scheduled medication and prompts for an approved prescription.
5. In the Pharmacist Desk (`/pharmacist`), review pending prescriptions, inspect the document, and click **"Approve Rx"**.
6. Return to checkout; select the approved prescription, and place the order.
7. An official Curevia Invoice Modal is generated with batch audit confirmation.

### Scenario 2: ACID Concurrency & Expiry Rejection Trigger Test
1. Visit the Executive Analytics page at `http://127.0.0.1:5000/admin`.
2. Click the **"Test DBMS Trigger (Expiry Rejection)"** button in the top right.
3. The system executes `sp_PlaceOrder` targeting expired batch `#4 (AZI-2023-EXP)`.
4. Trigger `trg_before_order_item_insert` immediately intercepts the transaction, raises `SQLSTATE 45000`, and rolls back. An alert displays the exact MySQL exception message.
5. No records are written to `orders` or `order_items`, verifying ACID compliance.

### Scenario 3: Real-Time Batch Expiry Vigilance
1. Navigate to `http://127.0.0.1:5000/pharmacist` and switch to the **"Inventory Alerts"** tab.
2. View real-time color-coded badges directly from `view_inventory_alerts`:
   - <span style="color:#DC2626;font-weight:bold;">EXPIRED</span>: Past batches (e.g. `AZI-2023-EXP`).
   - <span style="color:#D97706;font-weight:bold;">EXPIRING SOON</span>: Batches expiring in &le; 30 days (e.g. `AUG-2024-URG`).
   - <span style="color:#CA8A04;font-weight:bold;">LOW STOCK</span>: Batches with &le; 15 units remaining (e.g. `GLY-2025-LOW`).
   - <span style="color:#065F46;font-weight:bold;">ADEQUATE</span>: Abundant fresh stock.

---

## 6. Default Credentials (Seed Users)

| Role | Name | Email | Default Password |
|---|---|---|---|
| **Customer** | Aarav Sharma | `customer@curevia.com` | `curevia2026` |
| **Pharmacist** | Dr. Sneha Patel | `pharmacist@curevia.com` | `curevia2026` |
| **Admin** | Debopriyo Admin | `admin@curevia.com` | `curevia2026` |

---

## 7. License & Academic Attribution
Developed for DBMS Academic Evaluation. All rights reserved &copy; 2026 Curevia Inc.

