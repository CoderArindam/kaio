import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()
url = os.getenv('DATABASE_URL', 'postgresql://postgres:Password%40123@localhost:5432/kanban_test_db')

async def main():
    conn = await asyncpg.connect(url)
    with open('../database/migrations/083_deduplicate_board_members.sql', 'r') as f:
        await conn.execute(f.read())
    print('Applied 083_deduplicate_board_members.sql')
    await conn.close()

if __name__ == '__main__':
    asyncio.run(main())
