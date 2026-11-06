"""
Curevia E-Pharmacy - Standalone Database Setup & Recovery Utility (init_db.py)
Brand: Curevia | Tagline: Precision Care, Verified Deliveries

Automatically creates the target database, sets up 3NF schema tables,
triggers, stored procedures, analytical views, and seeds initial data.
Provides colored console diagnostics.
"""

import os
import sys
import getpass
import pymysql
from dotenv import load_dotenv

# Load configuration from .env
load_dotenv()

DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
DB_PORT = int(os.getenv("DB_PORT", "3306"))
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "curevia_db")

# ANSI Color codes for clean terminal feedback
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"


def print_banner():
    print(f"{CYAN}{BOLD}" + "=" * 70)
    print("  CUREVIA E-PHARMACY: DATABASE SETUP & RECOVERY ENGINE")
    print("  Precision Care, Verified Deliveries")
    print("=" * 70 + f"{RESET}\n")


def prompt_credentials_if_needed():
    """Checks if current credentials work; if not, allows user to enter password interactively."""
    global DB_PASSWORD, DB_USER, DB_HOST, DB_PORT

    print(f"[*] Testing connection with current .env configuration:")
    print(f"    Host: {DB_HOST}:{DB_PORT} | User: {DB_USER} | Target DB: {DB_NAME}")

    try:
        conn = pymysql.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            charset="utf8mb4",
            connect_timeout=3
        )
        conn.close()
        print(f"{GREEN}[✓] Credentials verified successfully!{RESET}\n")
        return True
    except pymysql.err.OperationalError as err:
        error_code = err.args[0] if err.args else 0
        if error_code == 1045:
            print(f"{RED}[!] Access Denied (Code 1045): Incorrect password for user '{DB_USER}'.{RESET}")
            # Try blank password
            try:
                test_conn = pymysql.connect(host=DB_HOST, port=DB_PORT, user=DB_USER, password="", connect_timeout=2)
                test_conn.close()
                print(f"{GREEN}[✓] Connected with empty password! Updating in-memory credentials.{RESET}")
                DB_PASSWORD = ""
                return True
            except Exception:
                pass

            # If running in interactive terminal, prompt for password
            if sys.stdin.isatty():
                print(f"{YELLOW}[?] Please enter your MySQL root password (or press Enter if blank):{RESET}")
                try:
                    entered_pw = getpass.getpass("    MySQL Password: ")
                    test_conn = pymysql.connect(host=DB_HOST, port=DB_PORT, user=DB_USER, password=entered_pw, connect_timeout=3)
                    test_conn.close()
                    DB_PASSWORD = entered_pw
                    print(f"{GREEN}[✓] Connected successfully with entered password!{RESET}")
                    
                    # Update .env file with valid password
                    update_env_file(DB_PASSWORD)
                    return True
                except Exception as inner_err:
                    print(f"{RED}[-] Failed with entered password: {inner_err}{RESET}")
            else:
                print(f"{YELLOW}[i] Non-interactive environment. Please update DB_PASSWORD in your .env file.{RESET}")
        elif error_code == 2003:
            print(f"{RED}[!] Connection Refused (Code 2003): MySQL Server is not running on {DB_HOST}:{DB_PORT}.{RESET}")
            print(f"    Action: Start your MySQL service (e.g. net start MySQL80 or open MySQL Workbench).")
        else:
            print(f"{RED}[!] Connection error: {err}{RESET}")
        return False


def update_env_file(valid_password):
    """Updates .env file with the working password."""
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if not os.path.exists(env_path):
        return
    try:
        with open(env_path, "r", encoding="utf-8") as f:
            lines = f.readlines()
        new_lines = []
        for line in lines:
            if line.startswith("DB_PASSWORD="):
                new_lines.append(f"DB_PASSWORD={valid_password}\n")
            else:
                new_lines.append(line)
        with open(env_path, "w", encoding="utf-8") as f:
            f.writelines(new_lines)
        print(f"{GREEN}[✓] Saved updated password into .env file.{RESET}")
    except Exception as e:
        print(f"{YELLOW}[!] Notice: Could not update .env file: {e}{RESET}")


def execute_sql_file(conn, filename, target_db):
    """Parses and executes SQL file with delimiter support."""
    if not os.path.exists(filename):
        print(f"{RED}[-] File '{filename}' not found.{RESET}")
        return False

    with open(filename, "r", encoding="utf-8") as f:
        content = f.read()

    # Replace hardcoded database names with target_db
    content = content.replace("curevia_db", target_db)
    content = content.replace("pharmacy_db", target_db)

    cursor = conn.cursor()
    statements = []
    current_statement = []
    current_delimiter = ";"

    for line in content.splitlines():
        stripped = line.strip()
        if stripped.upper().startswith("DELIMITER"):
            parts = stripped.split()
            if len(parts) >= 2:
                current_delimiter = parts[1]
            continue

        if not stripped or stripped.startswith("--") or stripped.startswith("/*"):
            continue

        current_statement.append(line)
        if stripped.endswith(current_delimiter):
            stmt = "\n".join(current_statement)
            if current_delimiter != ";":
                stmt = stmt.rstrip()
                if stmt.endswith(current_delimiter):
                    stmt = stmt[:-len(current_delimiter)].strip()
            statements.append(stmt)
            current_statement = []

    executed = 0
    for stmt in statements:
        clean = stmt.strip()
        if not clean:
            continue
        try:
            cursor.execute(clean)
            executed += 1
        except Exception as e:
            # Ignore DROP IF EXISTS warnings
            if "Unknown table" in str(e) or "doesn't exist" in str(e):
                continue
            print(f"{RED}[-] Error executing SQL statement in {filename}:{RESET}")
            print(f"    Statement: {clean[:100]}...")
            print(f"    Reason: {e}")
            cursor.close()
            return False

    cursor.close()
    print(f"{GREEN}[✓] Executed {executed} statements from {filename}.{RESET}")
    return True


def run_init():
    print_banner()

    # Step 1: Verify / Acquire working credentials
    if not prompt_credentials_if_needed():
        print(f"\n{RED}[!] Database initialization aborted due to connection failure.{RESET}")
        print(f"{YELLOW}[*] Curevia will continue to operate with 100% functionality via its In-Memory Demo Store.{RESET}\n")
        return False

    # Step 2: Connect to server and create database
    try:
        conn = pymysql.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            charset="utf8mb4",
            autocommit=True
        )
        with conn.cursor() as cursor:
            cursor.execute(f"CREATE DATABASE IF NOT EXISTS `{DB_NAME}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")
            cursor.execute(f"USE `{DB_NAME}`;")
        print(f"{GREEN}[✓] Target database `{DB_NAME}` created / selected.{RESET}")
    except Exception as e:
        print(f"{RED}[-] Failed creating database: {e}{RESET}")
        return False

    # Step 3: Run schema.sql
    print(f"[*] Executing schema definitions from schema.sql...")
    if not execute_sql_file(conn, "schema.sql", DB_NAME):
        conn.close()
        return False

    # Step 4: Run seed.sql
    print(f"[*] Executing seed data insertion from seed.sql...")
    if not execute_sql_file(conn, "seed.sql", DB_NAME):
        conn.close()
        return False

    # Step 5: Verification audit
    print(f"\n[*] Performing verification audit on `{DB_NAME}`:")
    with conn.cursor() as cursor:
        cursor.execute("SHOW FULL TABLES WHERE Table_Type = 'BASE TABLE';")
        tables = [list(r.values())[0] if isinstance(r, dict) else r[0] for r in cursor.fetchall()]
        cursor.execute("SHOW FULL TABLES WHERE Table_Type = 'VIEW';")
        views = [list(r.values())[0] if isinstance(r, dict) else r[0] for r in cursor.fetchall()]
        cursor.execute("SELECT COUNT(*) FROM products;")
        prod_count = cursor.fetchone()[0]
        cursor.execute("SELECT COUNT(*) FROM batch_inventory;")
        batch_count = cursor.fetchone()[0]

    conn.close()

    print(f"    {GREEN}• Tables Created ({len(tables)}):{RESET} {', '.join(tables)}")
    print(f"    {GREEN}• Analytical Views ({len(views)}):{RESET} {', '.join(views)}")
    print(f"    {GREEN}• Initial Catalog:{RESET} {prod_count} products, {batch_count} inventory batches ready.")

    print(f"\n{GREEN}{BOLD}" + "=" * 70)
    print("  DATABASE SETUP COMPLETE: Curevia is ready for live MySQL operation!")
    print("=" * 70 + f"{RESET}\n")
    return True


if __name__ == "__main__":
    run_init()

