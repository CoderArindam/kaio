import asyncio
import asyncpg
import os
import glob
from dotenv import load_dotenv

load_dotenv()
url = os.getenv('NEON_DATABASE_URL')

if not url:
    print("NEON_DATABASE_URL not found in .env")
    exit(1)

async def main():
    print(f"Connecting to {url.split('@')[1] if '@' in url else url}...")
    try:
        conn = await asyncpg.connect(url)
    except Exception as e:
        print(f"Failed to connect: {e}")
        return

    print("Wiping public schema...")
    try:
        await conn.execute("DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO public;")
        print("Schema wiped.")
    except Exception as e:
        print(f"Failed to wipe schema: {e}")
        return

    migrations_dir = '../database/migrations'
    migration_files = sorted(glob.glob(os.path.join(migrations_dir, '*.sql')))
    
    if not migration_files:
        print("No migration files found.")
        return

    print(f"Found {len(migration_files)} migration files.")

    for file_path in migration_files:
        file_name = os.path.basename(file_path)
        print(f"Applying {file_name}...")
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                sql = f.read()
            await conn.execute(sql)
            print(f"Successfully applied {file_name}")
        except Exception as e:
            print(f"Error applying {file_name}: {e}")
            break

    await conn.close()
    print("Finished.")

if __name__ == '__main__':
    asyncio.run(main())
