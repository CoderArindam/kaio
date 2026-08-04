import logging
import asyncpg
from fastapi import HTTPException
from pydantic import BaseModel
from typing import Optional
from app.auth.password import verify_password
# pyrefly: ignore [missing-import]
from app.websockets.manager import connection_manager
from app.meeting.services.meeting_service import MeetingService

logger = logging.getLogger(__name__)

class OrganizationDeletionRequest(BaseModel):
    password: str
    organization_name: str
    skip_grace_period: bool = False

class OrganizationDeletionService:
    def __init__(self, conn: asyncpg.Connection, meeting_service: Optional[MeetingService] = None):
        self.conn = conn
        self.meeting_service = meeting_service

    async def verify_user_password(self, user_id: int, password: str):
        user_hash = await self.conn.fetchval("SELECT password_hash FROM users WHERE id = $1", user_id)
        if not user_hash or not verify_password(password, user_hash):
            raise HTTPException(status_code=403, detail="Invalid password")

    async def initiate_deletion(self, org_id: int, user_id: int, req: OrganizationDeletionRequest) -> dict:
        # Verify password first
        await self.verify_user_password(user_id, req.password)

        grace_period_hours = 0 if req.skip_grace_period else 24

        try:
            # Atomic initiation via CAS DB function
            org_id_ret = await self.conn.fetchval(
                "SELECT fn_initiate_organization_deletion($1, $2, $3, $4)",
                org_id, user_id, req.organization_name, grace_period_hours
            )
            
            if not org_id_ret:
                raise HTTPException(status_code=409, detail="Could not initiate deletion (may already be in progress)")
                
        except asyncpg.exceptions.RaiseError as e:
            msg = str(e)
            if 'ORGANIZATION_NAME_MISMATCH' in msg:
                raise HTTPException(status_code=400, detail="Organization name does not match")
            elif 'UNAUTHORIZED' in msg:
                raise HTTPException(status_code=403, detail="Must be a SUPER_ADMIN to delete organization")
            elif 'DELETION_ALREADY_IN_PROGRESS' in msg:
                raise HTTPException(status_code=409, detail="Organization deletion already in progress")
            else:
                logger.error(f"Error initiating deletion: {e}")
                raise HTTPException(status_code=500, detail="Internal error during deletion initiation")

        # 1. Teardown active meeting bots
        try:
            if self.meeting_service:
                await self.meeting_service.shutdown_for_organization(org_id)
        except Exception as e:
            logger.error(f"Failed to shutdown meetings for org {org_id}: {e}")

        # 2. WebSocket broadcast
        await connection_manager.send_to_org(org_id, {
            "type": "organization_deletion_scheduled",
            "data": {
                "grace_period_hours": grace_period_hours
            }
        })

        # 3. Disconnect all clients for this org
        if hasattr(connection_manager, 'disconnect_org'):
            await connection_manager.disconnect_org(org_id)
        else:
            # Fallback if disconnect_org doesn't exist
            if org_id in connection_manager._org_users:
                user_ids = list(connection_manager._org_users[org_id])
                for uid in user_ids:
                    sockets = list(connection_manager._user_connections.get(uid, set()))
                    for ws in sockets:
                        try:
                            await ws.close(code=1008, reason="Organization deletion initiated")
                            await connection_manager.disconnect(ws, uid, org_id)
                        except Exception:
                            pass

        # 4. Email notifications to org members
        try:
            from app.services.email_service import EmailService
            members = await self.conn.fetch("SELECT email, first_name FROM users WHERE organization_id = $1", org_id)
            email_service = EmailService()
            for member in members:
                try:
                    await email_service.send_email(
                        to_email=member["email"],
                        subject="Organization Deletion Initiated",
                        body=f"Hi {member['first_name'] or 'Member'},\n\nYour organization '{req.organization_name}' has been scheduled for deletion. It will be permanently deleted in {grace_period_hours} hours. Please contact your administrator if this was a mistake.",
                        html_body=f"<p>Hi {member['first_name'] or 'Member'},</p><p>Your organization <b>{req.organization_name}</b> has been scheduled for deletion. It will be permanently deleted in {grace_period_hours} hours. Please contact your administrator if this was a mistake.</p>"
                    )
                except Exception as e:
                    logger.error(f"Failed to send org deletion email to {member['email']}: {e}")
        except Exception as e:
            logger.error(f"Failed to process emails: {e}")

        return {"status": "DELETING", "grace_period_hours": grace_period_hours}

    async def cancel_deletion(self, org_id: int, user_id: int) -> dict:
        try:
            await self.conn.execute("SELECT fn_cancel_organization_deletion($1, $2)", org_id, user_id)
        except asyncpg.exceptions.RaiseError as e:
            msg = str(e)
            if 'UNAUTHORIZED' in msg:
                raise HTTPException(status_code=403, detail="Must be a SUPER_ADMIN")
            elif 'CANNOT_CANCEL_DELETION' in msg:
                raise HTTPException(status_code=400, detail="Cannot cancel deletion (not DELETING)")
            else:
                logger.error(f"Error cancelling deletion: {e}")
                raise HTTPException(status_code=500, detail="Error cancelling deletion")

        # Broadcast cancellation
        await connection_manager.send_to_org(org_id, {
            "type": "organization_deletion_cancelled",
            "data": {}
        })
        
        return {"status": "ACTIVE"}

    async def get_status(self, org_id: int) -> dict:
        status_row = await self.conn.fetchrow(
            "SELECT status, deletion_scheduled_purge_at FROM organizations WHERE id = $1", org_id
        )
        if not status_row:
            raise HTTPException(status_code=404, detail="Organization not found")
        
        return dict(status_row)
