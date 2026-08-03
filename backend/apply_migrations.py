import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()
url = os.getenv('DATABASE_URL', 'postgresql://postgres:Password%40123@localhost:5432/kanban_test_db')

async def main():
    conn = await asyncpg.connect(url)
    with open('../database/migrations/041_timesheet_functions.sql', 'r') as f:
        await conn.execute(f.read())
    print('Applied 041_timesheet_functions.sql')

    with open('../database/migrations/045_simplify_timesheet_approvers.sql', 'r') as f:
        await conn.execute(f.read())
    print('Applied 045_simplify_timesheet_approvers.sql')

    with open('../database/migrations/043_timesheet_views.sql', 'r') as f:
        await conn.execute(f.read())
    print('Applied 043_timesheet_views.sql')

    with open('../database/migrations/046_enforce_task_assignment_timesheets.sql', 'r') as f:
        await conn.execute(f.read())
    print('Applied 046_enforce_task_assignment_timesheets.sql')

    with open('../database/migrations/047_fix_rejected_timesheet_status.sql', 'r') as f:
        await conn.execute(f.read())
    print('Applied 047_fix_rejected_timesheet_status.sql')

    with open('../database/migrations/064_comment_editing.sql', 'r') as f:
        await conn.execute(f.read())
    print('Applied 064_comment_editing.sql')

    with open('../database/migrations/012_authz_refinements.sql', 'r') as f:
        await conn.execute(f.read())
    print('Applied 012_authz_refinements.sql')

    with open('../database/migrations/030_activity_logging_enhancements.sql', 'r') as f:
        await conn.execute(f.read())
    print('Applied 030_activity_logging_enhancements.sql')

    with open('../database/migrations/065_comment_mentions.sql', 'r') as f:
        await conn.execute(f.read())
    print('Applied 065_comment_mentions.sql')

    await conn.close()

if __name__ == '__main__':
    asyncio.run(main())
