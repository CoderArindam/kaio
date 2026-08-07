import asyncio, asyncpg, os
from dotenv import load_dotenv

async def main():
    load_dotenv()
    url = os.getenv('DATABASE_URL', 'postgresql://postgres:Password%40123@localhost:5432/kanban_test_db')
    conn = await asyncpg.connect(url)
    rows = await conn.fetch("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'timesheet_entries'")
    print('timesheet_entries:', [dict(r) for r in rows])
    
    rows = await conn.fetch("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'tasks'")
    print('tasks:', [dict(r) for r in rows])
    
    rows = await conn.fetch("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users'")
    print('users:', [dict(r) for r in rows])
    await conn.close()

asyncio.run(main())
