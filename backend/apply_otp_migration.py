import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()
url = os.getenv('DATABASE_URL', 'postgresql://postgres:Password%40123@localhost:5432/kanban_test_db')

async def main():
    print(f"Connecting to database...")
    conn = await asyncpg.connect(url)
    migration_path = os.path.join(os.path.dirname(__file__), '../database/migrations/068_otp_verification.sql')
    with open(migration_path, 'r', encoding='utf-8') as f:
        sql = f.read()
    await conn.execute(sql)
    print("Successfully applied 068_otp_verification.sql!")
    await conn.close()

if __name__ == '__main__':
    asyncio.run(main())
