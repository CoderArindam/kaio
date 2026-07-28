import asyncio
import os
import random
import uuid
from datetime import datetime, timedelta, date
import asyncpg
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", "backend", ".env"))
DATABASE_URL = os.getenv("DATABASE_URL")

def parse_uuid(val):
    if val is None:
        return None
    if isinstance(val, uuid.UUID):
        return val
    s = str(val).strip()
    if s.isdigit():
        return uuid.UUID(f"00000000-0000-0000-0000-{int(s):012d}")
    try:
        return uuid.UUID(s)
    except Exception:
        return None

def get_monday(d: date) -> date:
    return d - timedelta(days=d.weekday())

# bcrypt hash for 'Password123!'
PWD_HASH = "$2b$12$5ZIUXiyEDnVJUWd.qu0/3uGY7tsFX85o.pQi6oOllmXH6radlM5TS"

# Additional team members from docs/USER_CREDENTIALS.md
EXTRA_TEAM_MEMBERS = [
    {"email": "aditya.singh@techinnovators.com", "first_name": "Aditya", "last_name": "Singh", "role": "MANAGER"},
    {"email": "neha.kapoor@techinnovators.com", "first_name": "Neha", "last_name": "Kapoor", "role": "MANAGER"},
    {"email": "arjun.sharma@techinnovators.com", "first_name": "Arjun", "last_name": "Sharma", "role": "MEMBER"},
    {"email": "rohan.verma@techinnovators.com", "first_name": "Rohan", "last_name": "Verma", "role": "MEMBER"},
    {"email": "sneha.iyer@techinnovators.com", "first_name": "Sneha", "last_name": "Iyer", "role": "MEMBER"},
    {"email": "vivek.rao@techinnovators.com", "first_name": "Vivek", "last_name": "Rao", "role": "MEMBER"},
    {"email": "aditi.mehta@techinnovators.com", "first_name": "Aditi", "last_name": "Mehta", "role": "MEMBER"},
    {"email": "nikhil.saxena@techinnovators.com", "first_name": "Nikhil", "last_name": "Saxena", "role": "MEMBER"},
    {"email": "abhinav.sood@techinnovators.com", "first_name": "Abhinav", "last_name": "Sood", "role": "MEMBER"},
    {"email": "shruti.iyengar@techinnovators.com", "first_name": "Shruti", "last_name": "Iyengar", "role": "MEMBER"},
]

WORK_DESCRIPTIONS = [
    "Integrated Razorpay webhook callbacks and updated payment ledger.",
    "Refactored backend API endpoints and added unit tests in Python FastAPI.",
    "Sprint planning, daily standup, and technical architecture sync meeting.",
    "PR code reviews, testing pull requests, and updating Cypress test suite.",
    "Migrated OAuth2 JWT auth session store to Redis cluster.",
    "Designed responsive glassmorphism UI components and CSS tokens.",
    "Investigated production slow queries and added composite indexes.",
    "Executed automated E2E test suites for timesheet approval flow.",
    "Updated OpenAPI technical documentation and database schema diagrams.",
    "Customer feedback review, backlog grooming, and priority alignment."
]

async def seed():
    conn = await asyncpg.connect(DATABASE_URL)
    print("Starting timesheet seeding for TechInnovators India...")

    # 1. Fetch Organization ID for TechInnovators India
    org = await conn.fetchrow("SELECT id FROM organizations WHERE name = 'TechInnovators India' LIMIT 1")
    if not org:
        print("TechInnovators India organization not found.")
        await conn.close()
        return

    org_id = org["id"]
    print(f"Target Organization ID: {org_id} (TechInnovators India)")

    # 2. Add extra users from USER_CREDENTIALS.md if missing
    for m in EXTRA_TEAM_MEMBERS:
        existing = await conn.fetchrow("SELECT id FROM users WHERE email = $1", m["email"])
        if not existing:
            await conn.execute(
                """
                INSERT INTO users (organization_id, email, password_hash, first_name, last_name, role, is_email_verified, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, true, NOW() - INTERVAL '60 days')
                """,
                org_id, m["email"], PWD_HASH, m["first_name"], m["last_name"], m["role"]
            )

    # 3. Fetch all active users in TechInnovators India
    users = await conn.fetch("SELECT id, email, first_name, last_name, role FROM users WHERE organization_id = $1 AND deleted_at IS NULL", org_id)
    user_ids = [u["id"] for u in users]
    user_id_map = {u["email"]: u["id"] for u in users}

    # Fetch managers for approver assignments
    managers = [u["id"] for u in users if u["role"] in ('MANAGER', 'SUPER_ADMIN')]
    if not managers:
        managers = user_ids

    # 4. Fetch boards & tasks
    boards = await conn.fetch("SELECT id, name FROM boards WHERE organization_id = $1 AND deleted_at IS NULL", org_id)
    board_ids = [b["id"] for b in boards]

    tasks = await conn.fetch("SELECT id, title, board_id FROM tasks WHERE board_id IN (SELECT id FROM boards WHERE organization_id = $1)", org_id)
    task_ids = [t["id"] for t in tasks]

    print(f"Total Users: {len(users)}, Boards: {len(boards)}, Tasks: {len(tasks)}")

    # 5. Seed Timesheets & Daily Time Logs for Past 52 Weeks (1 Full Year)
    today = date.today()
    current_monday = get_monday(today)
    weeks = [current_monday - timedelta(weeks=w) for w in range(52)]

    inserted_ts = 0
    inserted_entries = 0

    for week_start in weeks:
        week_end = week_start + timedelta(days=6)
        is_current = (week_start == current_monday)

        for u in users:
            uid = u["id"]
            user_uuid = parse_uuid(uid)
            org_uuid = parse_uuid(org_id)

            if is_current:
                status = random.choice(['submitted', 'draft', 'approved'])
            elif week_start == (current_monday - timedelta(weeks=1)):
                status = random.choice(['approved', 'submitted'])
            else:
                status = 'approved'

            approver_uid = random.choice(managers)
            approver_uuid = parse_uuid(approver_uid)

            # Check existing timesheet
            ts_row = await conn.fetchrow(
                """
                SELECT id FROM timesheets 
                WHERE (org_id::text = $1::text OR org_id::text = LTRIM(RIGHT($1::text, 12), '0'))
                  AND (user_id::text = $2::text OR user_id::text = LTRIM(RIGHT($2::text, 12), '0'))
                  AND week_start_date = $3
                """,
                str(org_uuid), str(user_uuid), week_start
            )

            if ts_row:
                ts_id = ts_row["id"]
                await conn.execute(
                    "UPDATE timesheets SET status = $1::timesheet_status, approver_id = $2 WHERE id = $3",
                    status, approver_uuid, ts_id
                )
            else:
                ts_id = await conn.fetchval(
                    """
                    INSERT INTO timesheets (
                        org_id, user_id, week_start_date, week_end_date, status, total_hours, 
                        submitted_at, reviewed_at, approver_id, created_at, updated_at
                    )
                    VALUES ($1, $2, $3, $4, $5::timesheet_status, 0.00, NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day', $6, NOW() - INTERVAL '3 days', NOW())
                    RETURNING id
                    """,
                    org_uuid, user_uuid, week_start, week_end, status, approver_uuid
                )
                inserted_ts += 1

            # Delete existing entries for this week to re-seed cleanly
            await conn.execute("DELETE FROM timesheet_entries WHERE timesheet_id = $1", ts_id)

            total_hours = 0.0
            for day_offset in range(5):
                entry_date = week_start + timedelta(days=day_offset)
                
                for _ in range(random.choice([1, 2])):
                    hours = float(random.choice([3.5, 4.0, 4.5, 7.5, 8.0]))
                    total_hours += hours
                    entry_type = random.choice(['task', 'general', 'meeting'])
                    desc = random.choice(WORK_DESCRIPTIONS)

                    sel_board = random.choice(board_ids) if board_ids else None
                    sel_task = random.choice(task_ids) if task_ids and entry_type == 'task' else None

                    board_uuid = parse_uuid(sel_board)
                    task_uuid = parse_uuid(sel_task)

                    await conn.execute(
                        """
                        INSERT INTO timesheet_entries (
                            timesheet_id, user_id, board_id, task_id, entry_date, hours, entry_type, description, is_overtime, created_at
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, $7::timesheet_entry_type, $8, $9, $10)
                        """,
                        ts_id, user_uuid, board_uuid, task_uuid, entry_date, hours, entry_type, desc, (hours > 8.0), datetime.combine(entry_date, datetime.min.time())
                    )
                    inserted_entries += 1

            await conn.execute("UPDATE timesheets SET total_hours = $1 WHERE id = $2", total_hours, ts_id)

    print(f"Successfully seeded timesheets for {len(users)} users across 52 past weeks!")
    print(f"Created {inserted_ts} Timesheets with {inserted_entries} Daily Time Entries.")
    await conn.close()

if __name__ == "__main__":
    asyncio.run(seed())
