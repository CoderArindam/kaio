import asyncio
import logging
import traceback
from app.database.connection import db
from app.services.notification_service import NotificationService

logger = logging.getLogger(__name__)

class TaskReminderWorker:
    def __init__(self, pool):
        self.pool = pool
        self._task = None
        self._stop_event = asyncio.Event()

    def start(self):
        if self._task is None:
            self._stop_event.clear()
            self._task = asyncio.create_task(self._run())
            logger.info("TaskReminderWorker started.")

    async def stop(self):
        if self._task:
            self._stop_event.set()
            try:
                await asyncio.wait_for(self._task, timeout=5.0)
            except asyncio.TimeoutError:
                self._task.cancel()
            except asyncio.CancelledError:
                pass
            self._task = None
            logger.info("TaskReminderWorker stopped.")

    async def _run(self):
        while not self._stop_event.is_set():
            try:
                await self._process_reminders()
            except Exception as e:
                logger.error(f"Error in TaskReminderWorker: {e}")
                logger.error(traceback.format_exc())
            
            try:
                # Wait 60 seconds or until stopped
                await asyncio.wait_for(self._stop_event.wait(), timeout=60.0)
            except asyncio.TimeoutError:
                pass

    async def _process_reminders(self):
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                # fn_get_due_reminders returns: task_id, title, board_id, board_name, assigned_to, organization_id
                # using FOR UPDATE SKIP LOCKED
                rows = await conn.fetch("SELECT * FROM fn_get_due_reminders(100)")
                if not rows:
                    return

                logger.info(f"Processing {len(rows)} due task reminders...")
                notification_svc = NotificationService(conn)
                
                task_ids = []
                for row in rows:
                    task_ids.append(row["task_id"])
                    try:
                        await notification_svc.notify_task_reminder(
                            task_id=row["task_id"],
                            task_title=row["title"],
                            board_id=row["board_id"],
                            assignee_id=row["assigned_to"],
                            org_id=row["organization_id"]
                        )
                    except Exception as e:
                        logger.error(f"Failed to send reminder for task {row['task_id']}: {e}")

                if task_ids:
                    await conn.execute("SELECT fn_mark_reminders_sent($1)", task_ids)
                    logger.info(f"Marked {len(task_ids)} task reminders as sent.")
