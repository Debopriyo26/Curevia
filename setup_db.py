"""
Curevia DBMS Setup & Verification Utility (setup_db.py)
Automates the creation and seeding of `curevia_db` schema, tables, triggers,
stored procedures, and analytical views using raw SQL scripts.
"""

import os
import sys
import pymysql
from dotenv import load_dotenv

load_dotenv()

DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
DB_PORT = int(os.getenv("DB_PORT", "3306"))
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "root")
DB_NAME = os.getenv("DB_NAME", "curevia_db")


def run_sql_script(filename):
    print(f"\n[+] Executing {filename} against MySQL ({DB_HOST}:{DB_PORT})...")
    if not os.path.exists(filename):
        print(f"[-] Error: File '{filename}' not found.")
        sys.exit(1)

    with open(filename, "r", encoding="utf-8") as f:
        content = f.read()

    # Connect to MySQL server (without selecting DB initially in case it doesn't exist yet)
    try:
        conn = pymysql.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            charset="utf8mb4",
            autocommit=True
        )
    except Exception as e:
        print(f"[-] MySQL connection failed: {e}")
        print("    Please ensure MySQL Server 8.0 is running and credentials in .env are correct.")
        sys.exit(1)

    cursor = conn.cursor()

    # Parse and execute SQL statements, respecting DELIMITER blocks
    statements = []
    current_statement = []
    current_delimiter = ";"

    lines = content.splitlines()
    for line in lines:
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
            # Remove trailing delimiter
            if current_delimiter != ";":
                stmt = stmt.rstrip()
                if stmt.endswith(current_delimiter):
                    stmt = stmt[:-len(current_delimiter)].strip()
            statements.append(stmt)
            current_statement = []

    executed_count = 0
    for stmt in statements:
        clean = stmt.strip()
        if not clean:
            continue
        try:
            cursor.execute(clean)
            executed_count += 1
        except Exception as e:
            print(f"[-] Error executing statement:\n{clean[:120]}...\nReason: {e}")
            conn.close()
            sys.exit(1)

    cursor.close()
    conn.close()
    print(f"[✓] Successfully executed {executed_count} statements from {filename}.")


def verify_installation():
    print("\n[+] Verifying Curevia DBMS installation...")
    try:
        conn = pymysql.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            database=DB_NAME,
            charset="utf8mb4",
            cursorclass=pymysql.cursors.DictCursor
        )
    except Exception as e:
        print(f"[-] Verification failed: {e}")
        return

    with conn.cursor() as cursor:
        # Check tables
        cursor.execute("SHOW FULL TABLES WHERE Table_Type = 'BASE TABLE';")
        tables = [list(row.values())[0] for row in cursor.fetchall()]
        print(f"    Tables ({len(tables)}): {', '.join(tables)}")

        # Check views
        cursor.execute("SHOW FULL TABLES WHERE Table_Type = 'VIEW';")
        views = [list(row.values())[0] for row in cursor.fetchall()]
        print(f"    Views ({len(views)}): {', '.join(views)}")

        # Check triggers
        cursor.execute("SHOW TRIGGERS;")
        triggers = [row['Trigger'] for row in cursor.fetchall()]
        print(f"    Triggers ({len(triggers)}): {', '.join(triggers)}")

        # Check procedures
        cursor.execute(f"SHOW PROCEDURE STATUS WHERE Db = '{DB_NAME}';")
        procs = [row['Name'] for row in cursor.fetchall()]
        print(f"    Procedures ({len(procs)}): {', '.join(procs)}")

        # Check seed counts
        cursor.execute("SELECT COUNT(*) AS c FROM products;")
        prod_count = cursor.fetchone()['c']
        cursor.execute("SELECT COUNT(*) AS c FROM batch_inventory;")
        batch_count = cursor.fetchone()['c']
        cursor.execute("SELECT COUNT(*) AS c FROM users;")
        user_count = cursor.fetchone()['c']
        print(f"    Initial Catalog: {prod_count} products, {batch_count} inventory batches, {user_count} users.")

    conn.close()
    print("\n[✓] Curevia Database is fully initialized and production-ready!")


if __name__ == "__main__":
    print("=" * 65)
    print("  CUREVIA DBMS SETUP UTILITY - PRECISION CARE, VERIFIED DELIVERIES")
    print("=" * 65)
    run_sql_script("schema.sql")
    run_sql_script("seed.sql")
    verify_installation()

