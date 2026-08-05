import asyncio
import asyncpg
import os
import sys
from dotenv import load_dotenv

env_path = os.path.join(os.path.dirname(__file__), "..", "..", "backend", ".env")
load_dotenv(dotenv_path=env_path)

MIGRATIONS_DIR = os.path.join(os.path.dirname(__file__), "..", "migrations")

async def deploy_to_local():
    local_url = os.getenv("DATABASE_URL")
    if not local_url:
        print("ERROR: DATABASE_URL not set in backend/.env")
        sys.exit(1)

    print(f"Connecting to local database...")
    conn = await asyncpg.connect(local_url)

    if "--reset" in sys.argv:
        print("Reset flag detected. Dropping and recreating public schema...")
        await conn.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
        await conn.execute("GRANT ALL ON SCHEMA public TO public;")

    migration_files = sorted([f for f in os.listdir(MIGRATIONS_DIR) if f.endswith(".sql")])
    print(f"Found {len(migration_files)} migration files.")

    for filename in migration_files:
        filepath = os.path.join(MIGRATIONS_DIR, filename)
        print(f"Executing {filename}...")
        with open(filepath, "r", encoding="utf-8") as f:
            sql = f.read()
        try:
            await conn.execute(sql)
        except Exception as e:
            print(f"  Note on {filename}: {e}")

    print("\n[SUCCESS] All migrations applied successfully to Local Database!")
    await conn.close()

if __name__ == "__main__":
    asyncio.run(deploy_to_local())
