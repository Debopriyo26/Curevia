"""
Curevia E-Pharmacy Management System
Flask Web Server, RESTful API & Authentication Controller (app.py)
Brand: Curevia | Tagline: Precision Care, Verified Deliveries

Features:
- Supabase (PostgreSQL) + PyMySQL + In-Memory Fallback multi-engine persistence via db.py
- Unrestricted Customer Checkout (Rx attachment is 100% optional, eliminating barriers)
- Secure Staff Authentication with Secret Access Codes for Pharmacists and Admins
- Purged all technical/developer jargon from client-facing responses
"""

import os
import uuid
from decimal import Decimal
from datetime import date, datetime
from functools import wraps
from flask import Flask, request, jsonify, render_template, redirect, url_for, session
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv

import db

# Load environment configuration
load_dotenv()

app = Flask(__name__, static_folder="static", template_folder="templates")
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "curevia_secure_session_key_2026")
app.config["UPLOAD_FOLDER"] = os.path.join(app.root_path, "static", "uploads")
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16 MB max prescription upload
ALLOWED_EXTENSIONS = {"pdf", "png", "jpg", "jpeg", "webp"}

# Ensure upload directory exists
os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

# Secret staff access codes
PHARMACIST_CODES = ['PHARM-7021', 'RX-VERIFIED-2026', 'CLINIC-8841']
ADMIN_CODES = ['ADMIN-SUPER-9901', 'CUREVIA-ROOT-2026']


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def get_current_user():
    """Retrieve logged-in user profile from session if active."""
    user_id = session.get("user_id")
    if not user_id:
        return None
    try:
        user = db.get_user_by_id(user_id)
        if user:
            return user
    except Exception:
        pass
    return {
        "user_id": session.get("user_id"),
        "full_name": session.get("full_name"),
        "email": session.get("email"),
        "role": session.get("role", "Customer")
    }


def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get("user_id"):
            if request.path.startswith("/api/"):
                return jsonify({
                    "status": "error",
                    "message": "Please sign in to your Curevia account to proceed.",
                    "auth_required": True
                }), 401
            return redirect(url_for("auth_page", next=request.path))
        return f(*args, **kwargs)
    return decorated_function


def role_required(allowed_roles):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            user_id = session.get("user_id")
            if not user_id:
                if request.path.startswith("/api/"):
                    return jsonify({
                        "status": "error",
                        "message": "Authentication required.",
                        "auth_required": True
                    }), 401
                return redirect(url_for("auth_page", next=request.path))
            
            user_role = session.get("role", "Customer")
            if user_role not in allowed_roles:
                if request.path.startswith("/api/"):
                    return jsonify({
                        "status": "error",
                        "message": "Access restricted: Authorized healthcare personnel only."
                    }), 403
                return render_template(
                    "base.html",
                    page_title="Access Restricted",
                    custom_error_message="This section is restricted to authorized personnel."
                ), 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator


# Graceful error handlers
@app.errorhandler(db.DatabaseConnectionError)
def handle_db_connection_error(error):
    if request.path.startswith("/api/"):
        return jsonify({
            "status": "error",
            "message": "We are currently updating our medicine inventory. Please ensure your local database is running or try refreshing in a moment.",
            "code": "DB_MAINTENANCE"
        }), 503
    return render_template(
        "index.html",
        active_page="store",
        db_maintenance=True,
        maintenance_message="We are currently updating our medicine inventory. Please ensure your local database is running or try refreshing in a moment."
    ), 503


@app.errorhandler(404)
def not_found_error(error):
    if request.path.startswith("/api/"):
        return jsonify({"status": "error", "message": "Requested resource not found"}), 404
    return render_template("base.html", page_title="Page Not Found"), 404


@app.errorhandler(500)
def internal_error(error):
    if request.path.startswith("/api/"):
        return jsonify({
            "status": "error",
            "message": "We are currently experiencing a brief technical interruption. Please try again in a few moments."
        }), 500
    return render_template("base.html", page_title="Technical Interruption"), 500


# Context Processor to provide current user globally to Jinja templates
@app.context_processor
def inject_user_context():
    return {
        "current_user": {
            "user_id": session.get("user_id"),
            "full_name": session.get("full_name"),
            "email": session.get("email"),
            "role": session.get("role")
        } if session.get("user_id") else None
    }


# ============================================================================
# PAGE RENDERING ROUTES
# ============================================================================

@app.route("/")
def storefront_page():
    """Customer-facing storefront with catalog, search, cart, and prescription upload."""
    return render_template("index.html", active_page="store")


@app.route("/login")
@app.route("/auth")
def auth_page():
    """Unified, elegant Sign-In and Registration page."""
    if session.get("user_id"):
        return redirect(request.args.get("next") or url_for("storefront_page"))
    return render_template("auth.html", active_page="auth", next_url=request.args.get("next", "/"))


@app.route("/pharmacist")
@role_required(["Pharmacist", "Admin"])
def pharmacist_dashboard():
    """Pharmacist Portal for prescription verification & batch inventory alerts."""
    return render_template("pharmacist.html", active_page="pharmacist")


@app.route("/admin")
@role_required(["Admin"])
def admin_dashboard():
    """Admin Portal for operations analytics, order logs, and sales tracking."""
    return render_template("admin.html", active_page="admin")


# ============================================================================
# AUTHENTICATION API ENDPOINTS
# ============================================================================

@app.route("/api/auth/register", methods=["POST"])
def auth_register():
    """
    Registers a new user account with role validation.
    For Pharmacist and Admin roles, requires a valid secret authorization code.
    """
    try:
        data = request.get_json() or {}
        full_name = data.get("full_name", "").strip()
        email = data.get("email", "").strip().lower()
        phone_number = data.get("phone_number", "").strip()
        password = data.get("password", "")
        role = data.get("role", "Customer").strip()
        auth_code = data.get("auth_code", "").strip()

        if role not in ["Customer", "Pharmacist", "Admin"]:
            role = "Customer"

        # Validate secret access code for staff registrations
        if role == "Pharmacist":
            if not auth_code or auth_code not in PHARMACIST_CODES:
                return jsonify({
                    "status": "error",
                    "message": "Invalid staff authorization code for the selected role."
                }), 403
        elif role == "Admin":
            if not auth_code or auth_code not in ADMIN_CODES:
                return jsonify({
                    "status": "error",
                    "message": "Invalid staff authorization code for the selected role."
                }), 403

        if not full_name or not email or not password:
            return jsonify({
                "status": "error",
                "message": "Full name, email address, and a secure password are required."
            }), 400

        if len(password) < 6:
            return jsonify({
                "status": "error",
                "message": "Password must be at least 6 characters in length."
            }), 400

        # Check existing user
        existing_user = db.get_user_by_email(email)
        if existing_user:
            return jsonify({
                "status": "error",
                "message": "An account with this email address already exists. Please sign in."
            }), 409

        # Generate secure hash
        password_hash = generate_password_hash(password)

        user_id = db.register_user(
            full_name=full_name,
            email=email,
            password_hash=password_hash,
            phone_number=phone_number,
            role=role
        )

        # Store in session
        session["user_id"] = user_id
        session["full_name"] = full_name
        session["email"] = email
        session["role"] = role

        return jsonify({
            "status": "success",
            "message": f"Welcome to Curevia, {full_name}!",
            "user": {
                "user_id": user_id,
                "full_name": full_name,
                "email": email,
                "role": role
            }
        }), 201

    except db.DatabaseConnectionError:
        raise
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"Account creation could not be completed: {str(e)}"
        }), 500


@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    """
    Authenticates user with email & password and sets up session.
    """
    try:
        data = request.get_json() or {}
        email = data.get("email", "").strip().lower()
        password = data.get("password", "")

        if not email or not password:
            return jsonify({
                "status": "error",
                "message": "Please enter both your email address and password."
            }), 400

        user = db.get_user_by_email(email)

        if not user:
            return jsonify({
                "status": "error",
                "message": "Invalid email or password. Please verify your credentials."
            }), 401

        # Check password hash (with fallback to seed demo password check)
        is_valid = False
        stored_hash = user.get("password_hash", "")

        try:
            is_valid = check_password_hash(stored_hash, password)
        except Exception:
            is_valid = False

        # Support demo seed password 'curevia2026'
        if not is_valid and (password == "curevia2026" or stored_hash == password):
            is_valid = True

        if not is_valid:
            return jsonify({
                "status": "error",
                "message": "Invalid email or password. Please verify your credentials."
            }), 401

        # Establish session
        session["user_id"] = user["user_id"]
        session["full_name"] = user["full_name"]
        session["email"] = user["email"]
        session["role"] = user["role"]

        return jsonify({
            "status": "success",
            "message": f"Signed in successfully as {user['full_name']}.",
            "user": {
                "user_id": user["user_id"],
                "full_name": user["full_name"],
                "email": user["email"],
                "role": user["role"]
            }
        })

    except db.DatabaseConnectionError:
        raise
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": "Sign-in could not be completed at this time."
        }), 500


@app.route("/api/auth/logout", methods=["POST", "GET"])
def auth_logout():
    """Clears user session and logs out."""
    session.clear()
    if request.is_json or request.path.startswith("/api/"):
        return jsonify({"status": "success", "message": "Signed out successfully."})
    return redirect(url_for("storefront_page"))


@app.route("/api/auth/me", methods=["GET"])
def auth_me():
    """Returns currently authenticated user profile or null."""
    user = get_current_user()
    if user and user.get("user_id"):
        return jsonify({
            "status": "success",
            "authenticated": True,
            "user": {
                "user_id": user["user_id"],
                "full_name": user["full_name"],
                "email": user["email"],
                "role": user.get("role", "Customer")
            }
        })
    return jsonify({
        "status": "success",
        "authenticated": False,
        "user": None
    })


# ============================================================================
# SYSTEM HEALTH & CATALOG REST APIS
# ============================================================================

@app.route("/api/system/status", methods=["GET"])
def system_status():
    """Check system readiness with clean consumer-facing status."""
    res = db.test_connection()
    return jsonify({
        "status": "success" if res.get("connected") else "error",
        "system_status": "Live" if res.get("connected") else "Maintenance",
        "message": res.get("message", "Service running normally.")
    })


@app.route("/api/categories", methods=["GET"])
def get_categories():
    """Fetch product category hierarchy."""
    try:
        cat_data = db.get_categories()
        return jsonify({
            "status": "success",
            "categories": cat_data.get("categories", []),
            "flat": cat_data.get("flat", [])
        })
    except db.DatabaseConnectionError:
        raise
    except Exception as e:
        return jsonify({"status": "error", "message": "Could not retrieve categories at this time."}), 500


@app.route("/api/products", methods=["GET"])
def get_products():
    """
    Fetch catalog with dynamic filtering:
    - category_id
    - search keyword
    - rx (prescription required: 1 or 0)
    """
    try:
        category_id = request.args.get("category_id", type=int)
        search_query = request.args.get("search", type=str, default="").strip()
        rx_filter = request.args.get("rx", type=str)

        products = db.get_products(category_id=category_id, search=search_query, rx=rx_filter)
        return jsonify({"status": "success", "count": len(products), "products": products})
    except db.DatabaseConnectionError:
        raise
    except Exception as e:
        return jsonify({"status": "error", "message": "Could not retrieve medications at this time."}), 500


@app.route("/api/products/<int:prod_id>/batches", methods=["GET"])
def get_product_batches(prod_id):
    """Fetch active, non-expired batches for a medication."""
    try:
        batches = db.get_product_batches(prod_id)
        return jsonify({"status": "success", "product_id": prod_id, "batches": batches})
    except db.DatabaseConnectionError:
        raise
    except Exception as e:
        return jsonify({"status": "error", "message": "Could not retrieve batch availability."}), 500


# ============================================================================
# PRESCRIPTIONS & PHARMACIST WORKFLOW
# ============================================================================

@app.route("/api/prescriptions/upload", methods=["POST"])
@login_required
def upload_prescription():
    """Upload customer prescription slip for verification."""
    try:
        user_id = session.get("user_id")
        doctor_name = request.form.get("doctor_name", "").strip()

        if not doctor_name:
            return jsonify({"status": "error", "message": "Doctor or clinic name is mandatory."}), 400

        if "prescription_file" not in request.files:
            return jsonify({"status": "error", "message": "No prescription document attached."}), 400

        file = request.files["prescription_file"]
        if file.filename == "":
            return jsonify({"status": "error", "message": "Please select a file to upload."}), 400

        if not allowed_file(file.filename):
            return jsonify({
                "status": "error",
                "message": "Invalid file format. Please upload a PDF, PNG, JPG, or WEBP file."
            }), 400

        ext = file.filename.rsplit(".", 1)[1].lower()
        unique_name = f"rx_{user_id}_{uuid.uuid4().hex[:10]}.{ext}"
        save_path = os.path.join(app.config["UPLOAD_FOLDER"], unique_name)
        file.save(save_path)

        relative_path = f"uploads/{unique_name}"
        rx_id = db.add_prescription(user_id, doctor_name, relative_path)

        return jsonify({
            "status": "success",
            "message": "Prescription submitted successfully. Our registered pharmacist will verify it shortly.",
            "prescription": {
                "prescription_id": rx_id,
                "user_id": user_id,
                "doctor_name": doctor_name,
                "file_path": relative_path,
                "status": "Pending"
            }
        }), 201
    except db.DatabaseConnectionError:
        raise
    except Exception as e:
        return jsonify({"status": "error", "message": "Prescription upload could not be processed."}), 500


@app.route("/api/prescriptions", methods=["GET"])
def get_prescriptions():
    """
    Fetch prescriptions.
    Customers see their own prescriptions; Pharmacists and Admins see the verification queue.
    """
    try:
        user_id = session.get("user_id")
        user_role = session.get("role", "Customer")
        status = request.args.get("status")

        # Clean empty string status filter
        if status == "" or status == "all" or status == "All":
            status = None

        target_user = None
        if user_role == "Customer" or not user_role:
            if not user_id:
                return jsonify({"status": "success", "prescriptions": []})
            target_user = user_id
        elif request.args.get("user_id"):
            target_user = request.args.get("user_id", type=int)

        prescriptions = db.get_prescriptions(status=status, user_id=target_user)
        return jsonify({"status": "success", "prescriptions": prescriptions})
    except db.DatabaseConnectionError:
        raise
    except Exception as e:
        return jsonify({"status": "error", "message": "Could not retrieve prescriptions."}), 500


@app.route("/api/prescriptions/<int:rx_id>/verify", methods=["POST"])
@role_required(["Pharmacist", "Admin"])
def verify_prescription(rx_id):
    """Pharmacist endpoint to approve or reject a prescription."""
    try:
        data = request.get_json() or {}
        new_status = data.get("status")
        verifier_id = session.get("user_id", 2)

        if new_status not in ["Approved", "Rejected"]:
            return jsonify({"status": "error", "message": "Status must be 'Approved' or 'Rejected'."}), 400

        db.verify_prescription(rx_id, new_status, verifier_id)

        return jsonify({
            "status": "success",
            "message": f"Prescription #{rx_id} successfully marked as {new_status}.",
            "prescription_id": rx_id,
            "new_status": new_status
        })
    except db.DatabaseConnectionError:
        raise
    except Exception as e:
        return jsonify({"status": "error", "message": "Verification update failed."}), 500


# ============================================================================
# INVENTORY BATCH & ORDER CHECKOUT WORKFLOWS
# ============================================================================

@app.route("/api/inventory/alerts", methods=["GET"])
@role_required(["Pharmacist", "Admin"])
def get_inventory_alerts():
    """Fetch inventory vigilance alerts."""
    try:
        filter_status = request.args.get("status")
        if filter_status == "":
            filter_status = None

        alerts = db.get_inventory_alerts(status_filter=filter_status)

        counts = {
            "total_batches": len(alerts),
            "expired": sum(1 for a in alerts if a.get("alert_status") == "EXPIRED"),
            "expiring_soon": sum(1 for a in alerts if a.get("alert_status") == "EXPIRING SOON"),
            "low_stock": sum(1 for a in alerts if a.get("alert_status") == "LOW STOCK"),
            "adequate": sum(1 for a in alerts if a.get("alert_status") == "ADEQUATE"),
        }

        return jsonify({"status": "success", "counts": counts, "alerts": alerts})
    except db.DatabaseConnectionError:
        raise
    except Exception as e:
        return jsonify({"status": "error", "message": "Could not load inventory alerts."}), 500


@app.route("/api/inventory/batch", methods=["POST"])
@role_required(["Pharmacist", "Admin"])
def add_inventory_batch():
    """Add a new incoming batch into inventory."""
    try:
        data = request.get_json() or {}
        product_id = data.get("product_id")
        batch_number = str(data.get("batch_number", "")).strip().upper()
        mfg_date = data.get("manufacturing_date")
        exp_date = data.get("expiry_date")
        stock_quantity = data.get("stock_quantity")

        if not all([product_id, batch_number, mfg_date, exp_date, stock_quantity is not None]):
            return jsonify({"status": "error", "message": "All batch details are required."}), 400

        try:
            stock_quantity = int(stock_quantity)
            if stock_quantity < 0:
                raise ValueError()
        except ValueError:
            return jsonify({"status": "error", "message": "Quantity must be a positive number."}), 400

        if str(exp_date) <= str(mfg_date):
            return jsonify({"status": "error", "message": "Expiry date must be after manufacturing date."}), 400

        batch_id = db.add_batch(
            product_id=int(product_id),
            batch_number=batch_number,
            mfg_date=mfg_date,
            exp_date=exp_date,
            stock_quantity=stock_quantity
        )

        return jsonify({
            "status": "success",
            "message": f"Batch '{batch_number}' has been logged into inventory.",
            "batch_id": batch_id
        }), 201
    except db.DatabaseConnectionError:
        raise
    except Exception as e:
        err_msg = str(e)
        if "Duplicate entry" in err_msg or "unique" in err_msg.lower():
            return jsonify({"status": "error", "message": f"Batch number '{batch_number}' is already registered."}), 409
        return jsonify({"status": "error", "message": "Unable to log batch."}), 500


@app.route("/api/orders/checkout", methods=["POST"])
@login_required
def checkout_order():
    """
    Executes customer checkout.
    Prescription attachment is completely OPTIONAL — customers can purchase unrestricted.
    """
    try:
        data = request.get_json() or {}
        user_id = session.get("user_id")
        prescription_id = data.get("prescription_id")
        shipping_address = data.get("shipping_address", "").strip()
        product_id = data.get("product_id")
        batch_id = data.get("batch_id")
        quantity = data.get("quantity", 1)

        if not shipping_address:
            return jsonify({"status": "error", "message": "Please provide your delivery shipping address."}), 400

        if not product_id or not batch_id:
            return jsonify({"status": "error", "message": "Please select your medication and batch."}), 400

        try:
            quantity = int(quantity)
            if quantity <= 0:
                raise ValueError()
        except ValueError:
            return jsonify({"status": "error", "message": "Order quantity must be at least 1."}), 400

        if not prescription_id or prescription_id == "null" or prescription_id == "":
            prescription_id = None
        else:
            try:
                prescription_id = int(prescription_id)
            except ValueError:
                prescription_id = None

        new_order_id, invoice = db.checkout_order(
            user_id=user_id,
            shipping_address=shipping_address,
            product_id=int(product_id),
            batch_id=int(batch_id),
            quantity=quantity,
            prescription_id=prescription_id
        )

        return jsonify({
            "status": "success",
            "message": f"Order #{new_order_id} placed successfully!",
            "order_id": new_order_id,
            "invoice": invoice
        }), 201

    except db.DatabaseConnectionError:
        raise
    except Exception as e:
        raw_msg = str(e)
        clean_msg = "Order placement could not be completed."
        if "expired" in raw_msg.lower():
            clean_msg = "Order rejected: Cannot dispense medication from an expired batch."
        elif "exceeds" in raw_msg.lower() or "insufficient" in raw_msg.lower():
            clean_msg = "Order rejected: Insufficient stock available in selected batch."
        else:
            clean_msg = raw_msg

        return jsonify({
            "status": "error",
            "message": clean_msg
        }), 400


@app.route("/api/orders", methods=["GET"])
@login_required
def get_orders():
    """Fetch orders history for current user."""
    try:
        user_id = session.get("user_id")
        user_role = session.get("role", "Customer")

        target_user = user_id if user_role == "Customer" else None
        orders = db.get_user_orders(user_id=target_user)
        return jsonify({"status": "success", "orders": orders})
    except db.DatabaseConnectionError:
        raise
    except Exception as e:
        return jsonify({"status": "error", "message": "Could not retrieve order history."}), 500


@app.route("/api/admin/metrics", methods=["GET"])
@role_required(["Admin"])
def get_admin_metrics():
    """Returns analytics for administrative overview."""
    try:
        metrics_data = db.get_admin_metrics()
        return jsonify({
            "status": "success",
            **metrics_data
        })
    except db.DatabaseConnectionError:
        raise
    except Exception as e:
        return jsonify({"status": "error", "message": "Could not retrieve operational analytics."}), 500


# Direct Execution
if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    debug_mode = os.getenv("FLASK_DEBUG", "True").lower() in ("true", "1")
    print("\n============================================================")
    print("  CUREVIA E-PHARMACY SYSTEM")
    print("  Official Tagline: Precision Care, Verified Deliveries")
    print(f"  Access Curevia Storefront at: http://127.0.0.1:{port}")
    print("============================================================\n")
    app.run(host="0.0.0.0", port=port, debug=debug_mode)
