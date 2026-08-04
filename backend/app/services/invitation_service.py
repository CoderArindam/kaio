import json
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import List, Tuple
import asyncpg
from fastapi import HTTPException
from app.schemas.invitations import InviteUserRequest, AcceptInvitationRequest
from app.auth.password import get_password_hash
from app.services.email_service import send_email
from app.services.email_templates import generate_workspace_invitation_email
from app.config.settings import settings

logger = logging.getLogger(__name__)

INVITATION_EXPIRE_HOURS = 72
VALID_INVITE_ROLES = {"MEMBER", "MANAGER"}

class InvitationService:
    def __init__(self, conn: asyncpg.Connection):
        self.conn = conn

    def _send_invitation_email(
        self,
        to_email: str,
        org_name: str,
        token: str,
        inviter_name: str = None,
        role: str = "MEMBER",
    ) -> None:
        frontend_url = settings.FRONTEND_ORIGINS.split(",")[0].strip()
        accept_url = f"{frontend_url}/accept-invitation?token={token}"

        subject, body_text, html_content = generate_workspace_invitation_email(
            org_name=org_name,
            accept_url=accept_url,
            inviter_name=inviter_name,
            role=role,
            expire_hours=INVITATION_EXPIRE_HOURS,
        )

        send_email(
            to_email=to_email,
            subject=subject,
            body_text=body_text,
            html_content=html_content,
        )

    async def invite_user(self, invite_in: InviteUserRequest, current_user: dict) -> Tuple[dict, str, str, str, str, str]:
        if invite_in.role not in VALID_INVITE_ROLES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid role. Invited users must be MEMBER or MANAGER.",
            )

        # Fetch inviter display name
        inviter_name = None
        inviter_id = current_user.get("id")
        if inviter_id:
            try:
                inviter_row = await self.conn.fetchrow(
                    "SELECT first_name, last_name, email FROM v_users_canonical WHERE id = $1", inviter_id
                )
                if inviter_row:
                    fname = (inviter_row.get("first_name") or "").strip()
                    lname = (inviter_row.get("last_name") or "").strip()
                    if fname or lname:
                        inviter_name = f"{fname} {lname}".strip()
                    else:
                        inviter_name = inviter_row.get("email")
            except Exception as e:
                logger.warning(f"Could not fetch inviter details for user_id {inviter_id}: {e}")

        email_clean = invite_in.email.strip().lower()

        # Check if the user is trying to invite themselves
        if email_clean == current_user.get("email", "").strip().lower():
            raise HTTPException(
                status_code=400,
                detail="You cannot invite yourself.",
            )

        # Check if email belongs to an existing registered user
        existing_user = await self.conn.fetchrow(
            "SELECT id, organization_id FROM v_users_canonical WHERE LOWER(email) = $1", email_clean
        )
        if existing_user:
            user_org = existing_user.get("organization_id")
            current_org = current_user.get("organization_id")
            if user_org == current_org:
                msg = "This person is already part of the organization"
                err_code = "USER_ALREADY_IN_ORG"
            else:
                msg = "This person is already registered to a different organization"
                err_code = "USER_IN_DIFFERENT_ORG"

            raise HTTPException(
                status_code=409,
                detail={
                    "error_code": err_code,
                    "message": msg
                }
            )

        organization_id = current_user["organization_id"]
        token = secrets.token_urlsafe(32)
        expires_at = datetime.now(timezone.utc) + timedelta(hours=INVITATION_EXPIRE_HOURS)

        try:
            org_result = await self.conn.fetchval(
                "SELECT get_organization_by_id($1)", organization_id
            )
            org_data = json.loads(org_result) if isinstance(org_result, str) else org_result
            org_name = org_data["name"] if org_data else "your organization"

            result = await self.conn.fetchval(
                "SELECT create_invitation($1, $2, $3, $4, $5)",
                organization_id,
                email_clean,
                invite_in.role,
                token,
                expires_at,
            )
            invitation = json.loads(result) if isinstance(result, str) else result
            return invitation, email_clean, org_name, token, inviter_name, invite_in.role
        except asyncpg.exceptions.RaiseError as e:
            err_msg = str(e)
            if "different organization" in err_msg.lower():
                raise HTTPException(
                    status_code=409,
                    detail={
                        "error_code": "USER_IN_DIFFERENT_ORG",
                        "message": "This person is already registered to a different organization"
                    }
                )
            elif "part of the organization" in err_msg.lower() or "already a registered user" in err_msg.lower():
                raise HTTPException(
                    status_code=409,
                    detail={
                        "error_code": "USER_ALREADY_IN_ORG",
                        "message": "This person is already part of the organization"
                    }
                )
            raise HTTPException(status_code=400, detail=err_msg)
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error creating invitation: {e}")
            raise HTTPException(status_code=500, detail="Failed to create invitation")

    async def list_invitations(self, current_user: dict) -> List[dict]:
        try:
            result = await self.conn.fetchval(
                "SELECT get_organization_invitations($1)",
                current_user["organization_id"],
            )
            return json.loads(result) if isinstance(result, str) else result
        except Exception as e:
            logger.error(f"Error listing invitations: {e}")
            raise HTTPException(status_code=500, detail="An unexpected error occurred")

    async def revoke_invitation(self, invitation_id: int, current_user: dict):
        try:
            result = await self.conn.fetchval(
                "SELECT revoke_invitation($1, $2)",
                invitation_id,
                current_user["organization_id"],
            )
            if not result:
                raise HTTPException(status_code=404, detail="Pending invitation not found")
            return json.loads(result) if isinstance(result, str) else result
        except asyncpg.exceptions.RaiseError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error revoking invitation {invitation_id}: {e}")
            raise HTTPException(status_code=400, detail="Pending invitation not found or already accepted")

    async def verify_invitation(self, token: str) -> dict:
        result = await self.conn.fetchval("SELECT get_invitation_by_token($1)", token)
        if not result:
            raise HTTPException(
                status_code=410,
                detail="This invitation link has been revoked or expired by an administrator."
            )

        invitation = json.loads(result) if isinstance(result, str) else result

        if invitation.get("accepted_at"):
            raise HTTPException(status_code=410, detail="Invitation has already been accepted")

        expires_at = datetime.fromisoformat(str(invitation["expires_at"]).replace("Z", "+00:00"))
        if expires_at < datetime.now(timezone.utc):
            raise HTTPException(status_code=410, detail="Invitation has expired")

        return invitation

    async def accept_invitation(self, body: AcceptInvitationRequest):
        if body.password != body.confirm_password:
            raise HTTPException(status_code=400, detail="Passwords do not match")

        if len(body.password) < 8:
            raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

        hashed_password = get_password_hash(body.password)
        try:
            result = await self.conn.fetchval(
                "SELECT accept_invitation($1, $2, $3, $4)",
                body.token,
                hashed_password,
                body.first_name,
                body.last_name,
            )
            if not result:
                raise HTTPException(status_code=400, detail="Failed to accept invitation")
        except asyncpg.exceptions.RaiseError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except Exception as e:
            logger.error(f"Error accepting invitation: {e}")
            raise HTTPException(status_code=500, detail="An unexpected error occurred")