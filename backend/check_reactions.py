import asyncio
import asyncpg
import os
import json
from dotenv import load_dotenv

load_dotenv()
url = os.getenv('DATABASE_URL', 'postgresql://postgres:Password%40123@localhost:5432/kanban_test_db')

async def main():
    conn = await asyncpg.connect(url)
    async with conn.transaction():
        await conn.execute("SELECT set_config('app.current_user_id', '5', true)")
        rows = await conn.fetch("SELECT * FROM v_comments_canonical WHERE task_id = 12")
        for row in rows:
            d = dict(row)
            print("Comment", d["id"], "reactions:")
            if d.get("reactions"):
                print(ascii(d["reactions"]))
            else:
                print("None")
    await conn.close()

if __name__ == '__main__':
    asyncio.run(main())
