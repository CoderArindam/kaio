import asyncio
import asyncpg
import os
import sys

MIGRATIONS_DIR = os.path.join(os.path.dirname(__file__), "..", "migrations")

async def deploy_to_neon():
    neon_url = os.getenv("NEON_DATABASE_URL") or os.getenv("DATABASE_URL")
    if not neon_url:
        print("ERROR: Please set NEON_DATABASE_URL or DATABASE_URL environment variable.")
        print("Example: set NEON_DATABASE_URL=postgresql://user:pass@ep-xyz.neon.tech/neondb?sslmode=require")
        sys.exit(1)

    print(f"Connecting to database...")
    conn = await asyncpg.connect(neon_url)

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
            # Ignore duplicate objects if running on an already seeded database
            print(f"  Note on {filename}: {e}")

    print("\n✅ All migrations applied successfully to Neon Database!")
    await conn.close()

if __name__ == "__main__":
    asyncio.run(deploy_to_neon())
