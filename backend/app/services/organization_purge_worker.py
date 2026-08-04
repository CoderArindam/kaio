import asyncio
import logging
import json
import asyncpg
from app.services.storage_service import StorageService

logger = logging.getLogger("kaio.purge_worker")

# Ordered list of tables to purge, from children to parents to satisfy FK constraints.
PURGE_TABLE_ORDER = [
    "comment_mentions",
    "task_comments",
    "subtasks",
    "task_labels",
    "task_attachments",
    "tasks",
    "labels",
    "board_columns",
    "board_members",
    "project_settings",
    "boards",
    "task_proposals",
    "meeting_sessions",
    "timesheet_audit_logs",
    "timesheet_entries",
    "timesheets",
    "timesheet_approver_assignments",
    "timesheet_policies",
    "notifications",
    "activities",
    "security_events",
    "user_sessions",
    "user_preferences",
    "organization_invitations",
    "organization_profile",
    "password_reset_tokens",
    "email_verification_tokens",
    "audit_logs"
]

BATCH_SIZE = 1000

class OrganizationPurgeWorker:
    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool
        self._running = False
        self._task = None

    def start(self):
        if not self._running:
            self._running = True
            self._task = asyncio.create_task(self._poll_loop())

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def _poll_loop(self):
        logger.info("Organization purge worker started")
        while self._running:
            try:
                await self._process_next_job()
            except Exception as e:
                logger.error(f"Error in organization purge worker loop: {e}")
            await asyncio.sleep(60) # Poll every 60 seconds

    async def _process_next_job(self):
        async with self.pool.acquire() as conn:
            org_id = await conn.fetchval("""
                SELECT id FROM organizations 
                WHERE status = 'DELETING' AND deletion_scheduled_purge_at <= NOW() 
                LIMIT 1
            """)
            
            if not org_id:
                return

            try:
                job_id = await conn.fetchval("SELECT fn_claim_organization_purge_job($1)", org_id)
                if not job_id:
                    return
            except Exception as e:
                logger.warning(f"Failed to claim purge job for org {org_id}: {e}")
                return

            logger.info(f"Starting purge for organization {org_id}, job {job_id}")

            try:
                # Get current progress
                progress_json = await conn.fetchval("SELECT progress FROM organization_deletion_jobs WHERE id = $1", job_id)
                progress = json.loads(progress_json) if progress_json else {}

                if isinstance(progress, str):
                    progress = json.loads(progress)

                # 1. Purge DB Tables
                for table in PURGE_TABLE_ORDER:
                    if progress.get(f"db_{table}"):
                        continue

                    await conn.execute("UPDATE organization_deletion_jobs SET current_phase = $1 WHERE id = $2", f"purging_table_{table}", job_id)
                    
                    while True:
                        deleted = await conn.fetchval("SELECT fn_purge_organization_batch($1, $2, $3)", org_id, table, BATCH_SIZE)
                        if deleted == 0:
                            break
                        await asyncio.sleep(0.01)

                    progress[f"db_{table}"] = True
                    await conn.execute("UPDATE organization_deletion_jobs SET progress = $1 WHERE id = $2", json.dumps(progress), job_id)

                # 2. Purge Cloudinary / Local Assets
                if not progress.get("storage_assets"):
                    await conn.execute("UPDATE organization_deletion_jobs SET current_phase = $1 WHERE id = $2", "purging_storage_assets", job_id)
                    try:
                        await StorageService.delete_organization_assets(org_id)
                        progress["storage_assets"] = True
                        await conn.execute("UPDATE organization_deletion_jobs SET progress = $1 WHERE id = $2", json.dumps(progress), job_id)
                    except Exception as e:
                        logger.error(f"Storage asset deletion failed for org {org_id}: {e}")
                        # Continue to finalization even if storage fails, 
                        # so we don't leave the DB in an intermediate PURGING state forever.

                # 3. Finalize
                await conn.execute("UPDATE organization_deletion_jobs SET current_phase = $1 WHERE id = $2", "finalizing", job_id)
                await conn.execute("SELECT fn_finalize_organization_purge($1)", org_id)
                
                logger.info(f"Successfully purged organization {org_id}")

            except Exception as e:
                logger.error(f"Error purging organization {org_id}: {e}")
                await conn.execute("UPDATE organization_deletion_jobs SET status = 'FAILED', last_error = $1 WHERE id = $2", str(e), job_id)
