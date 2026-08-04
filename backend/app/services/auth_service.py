import json
import logging
import secrets
import hashlib
from datetime import datetime, timedelta, timezone
from typing import List, Tuple, Optional
import asyncpg
from fastapi import HTTPException

from app.schemas.auth import OrganizationCreate, UserLogin
from app.auth.password import get_password_hash, verify_password

logger = logging.getLogger(__name__)

def mask_email(email: str) -> str:
    if "@" not in email:
        return email
    name, domain = email.split("@", 1)
    if len(name) <= 2:
        masked_name = name[0] + "*"
    else:
        masked_name = name[0] + "*" * (len(name) - 2) + name[-1]
    return f"{masked_name}@{domain}"


class AuthService:
    def __init__(self, conn: asyncpg.Connection):
        self.conn = conn

    def parse_user_agent(self, ua_string: str) -> Tuple[str, str, str]:
        ua = ua_string.lower()
        browser = "Unknown"
        if "edg" in ua or "edge" in ua:
            browser = "Edge"
        elif "chrome" in ua or "crios" in ua:
            browser = "Chrome"
        elif "firefox" in ua or "fxios" in ua:
            browser = "Firefox"
        elif "safari" in ua:
            browser = "Safari"
        elif "opera" in ua or "opr" in ua:
            browser = "Opera"
        
        platform = "Unknown"
        if "windows" in ua:
            platform = "Windows"
        elif "macintosh" in ua or "mac os" in ua:
            platform = "macOS"
        elif "android" in ua:
            platform = "Android"
        elif "iphone" in ua or "ipad" in ua or "ipod" in ua:
            platform = "iOS"
        elif "linux" in ua:
            platform = "Linux"
            
        return browser, platform, f"{browser} on {platform}"

    async def create_session(self, user_id: int, ua_string: str, ip_address: str) -> Tuple[str, int]:
        refresh_token = secrets.token_urlsafe(64)
        refresh_token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
        expires_at = datetime.now(timezone.utc) + timedelta(days=7)
        
        browser, platform, device_name = self.parse_user_agent(ua_string)
        
        session_id = await self.conn.fetchval(
            "SELECT fn_create_user_session($1, $2, $3, $4, $5, $6, $7)",
            user_id, refresh_token_hash, browser, platform, device_name, ip_address, expires_at
        )
        return refresh_token, session_id

    async def request_registration_otp(self, org_in: OrganizationCreate) -> dict:
        """Step 1 of Org Admin Signup: Check email uniqueness, generate registration OTP, return token & email details."""
        existing_user = await self.conn.fetchrow(
            "SELECT id FROM v_users_canonical WHERE LOWER(email) = LOWER($1)",
            org_in.email
        )
        if existing_user:
            raise HTTPException(status_code=409, detail="This email is already registered")

        hashed_password = get_password_hash(org_in.password)
        payload = {
            "org_name": org_in.org_name,
            "email": org_in.email,
            "hashed_password": hashed_password,
            "first_name": org_in.first_name,
            "last_name": org_in.last_name
        }

        row = await self.conn.fetchrow(
            "SELECT raw_otp, mfa_token FROM fn_create_registration_otp($1, $2::jsonb, $3)",
            org_in.email, json.dumps(payload), 10
        )
        if not row:
            raise HTTPException(status_code=500, detail="Failed to generate registration OTP")

        return {
            "otp_required": True,
            "registration_token": row["mfa_token"],
            "raw_otp": row["raw_otp"],
            "email": org_in.email,
            "masked_email": mask_email(org_in.email),
            "first_name": org_in.first_name,
            "message": f"Verification OTP code sent to {mask_email(org_in.email)}"
        }

    async def verify_registration_otp(self, registration_token: str, otp_code: str, ua_string: str, ip_address: str) -> dict:
        """Step 2 of Org Admin Signup: Verify OTP code, call stored procedure to create org & admin user, start session."""
        row = await self.conn.fetchrow(
            "SELECT success, error_code, payload, email FROM fn_verify_registration_otp($1, $2)",
            registration_token, otp_code
        )
        if not row or not row["success"]:
            error_code = row["error_code"] if row else "TOKEN_INVALID"
            error_map = {
                "TOKEN_INVALID": "Invalid or expired registration session",
                "OTP_EXPIRED": "Verification code has expired. Please request a new code.",
                "MAX_ATTEMPTS_EXCEEDED": "Too many failed attempts. Please request a new verification code.",
                "INVALID_OTP": "Incorrect 6-digit verification code. Please check your email."
            }
            raise HTTPException(status_code=400, detail=error_map.get(error_code, "OTP verification failed"))

        payload = json.loads(row["payload"]) if isinstance(row["payload"], str) else row["payload"]
        if not payload:
            raise HTTPException(status_code=400, detail="Invalid registration payload")

        try:
            org_id = await self.conn.fetchval(
                "SELECT create_organization_with_admin($1, $2, $3, $4, $5)",
                payload["org_name"],
                payload["email"],
                payload["hashed_password"],
                payload["first_name"],
                payload.get("last_name")
            )
            if not org_id:
                raise HTTPException(status_code=500, detail="Failed to create organization")

            user_row = await self.conn.fetchrow(
                "SELECT id, email, role, organization_id, is_email_verified, is_2fa_enabled, two_factor_type FROM v_users_canonical WHERE email = $1",
                payload["email"]
            )

            # Mark email as verified
            await self.conn.execute(
                "UPDATE users SET is_email_verified = TRUE, email_verified_at = NOW() WHERE id = $1",
                user_row["id"]
            )

            refresh_token, session_id = await self.create_session(user_row["id"], ua_string, ip_address)

            browser, platform, _ = self.parse_user_agent(ua_string)
            await self.conn.execute(
                "SELECT fn_log_security_event($1, $2, $3, $4::entity_type_enum, $5, $6, $7::jsonb)",
                org_id, user_row["id"], "ORG_REGISTERED", "USER", user_row["id"], ip_address,
                json.dumps({"browser": browser, "platform": platform, "status": "Success"})
            )

            user_data = dict(user_row)
            user_data["is_email_verified"] = True

            return {
                "organization": {"id": org_id, "name": payload["org_name"], "created_at": datetime.now(timezone.utc)},
                "user": user_data,
                "refresh_token": refresh_token,
                "session_id": session_id,
                "message": "Organization created and verified successfully"
            }
        except asyncpg.exceptions.UniqueViolationError:
            raise HTTPException(status_code=409, detail="This email or organization name is already registered")
        except Exception as e:
            logger.error(f"Error in verify_registration_otp: {e}")
            raise HTTPException(status_code=500, detail="An unexpected error occurred during organization creation")

    async def skip_registration_otp(self, registration_token: str, ua_string: str, ip_address: str) -> dict:
        """Skip OTP verification: create organization & admin user without email verification, start session."""
        row = await self.conn.fetchrow(
            "SELECT success, error_code, payload, email FROM fn_skip_registration_otp($1)",
            registration_token
        )
        if not row or not row["success"]:
            error_code = row["error_code"] if row else "TOKEN_INVALID"
            error_map = {
                "TOKEN_INVALID": "Invalid or expired registration session",
                "OTP_EXPIRED": "Registration session has expired. Please register again."
            }
            raise HTTPException(status_code=400, detail=error_map.get(error_code, "Failed to skip verification"))

        payload = json.loads(row["payload"]) if isinstance(row["payload"], str) else row["payload"]
        if not payload:
            raise HTTPException(status_code=400, detail="Invalid registration payload")

        try:
            org_id = await self.conn.fetchval(
                "SELECT create_organization_with_admin($1, $2, $3, $4, $5)",
                payload["org_name"],
                payload["email"],
                payload["hashed_password"],
                payload["first_name"],
                payload.get("last_name")
            )
            if not org_id:
                raise HTTPException(status_code=500, detail="Failed to create organization")

            user_row = await self.conn.fetchrow(
                "SELECT id, email, role, organization_id, is_email_verified, is_2fa_enabled, two_factor_type FROM v_users_canonical WHERE email = $1",
                payload["email"]
            )

            refresh_token, session_id = await self.create_session(user_row["id"], ua_string, ip_address)

            browser, platform, _ = self.parse_user_agent(ua_string)
            await self.conn.execute(
                "SELECT fn_log_security_event($1, $2, $3, $4::entity_type_enum, $5, $6, $7::jsonb)",
                org_id, user_row["id"], "ORG_REGISTERED", "USER", user_row["id"], ip_address,
                json.dumps({"browser": browser, "platform": platform, "status": "Success", "email_verified": False})
            )

            user_data = dict(user_row)

            return {
                "organization": {"id": org_id, "name": payload["org_name"], "created_at": datetime.now(timezone.utc)},
                "user": user_data,
                "refresh_token": refresh_token,
                "session_id": session_id,
                "message": "Organization created successfully without email verification"
            }
        except asyncpg.exceptions.UniqueViolationError:
            raise HTTPException(status_code=409, detail="This email or organization name is already registered")
        except Exception as e:
            logger.error(f"Error in skip_registration_otp: {e}")
            raise HTTPException(status_code=500, detail="An unexpected error occurred during organization creation")

    async def register_organization_direct(self, org_in: OrganizationCreate, ua_string: str, ip_address: str) -> dict:
        """Direct registration without OTP verification."""
        existing_user = await self.conn.fetchrow(
            "SELECT id FROM v_users_canonical WHERE LOWER(email) = LOWER($1)",
            org_in.email
        )
        if existing_user:
            raise HTTPException(status_code=409, detail="This email is already registered")

        hashed_password = get_password_hash(org_in.password)

        try:
            org_id = await self.conn.fetchval(
                "SELECT create_organization_with_admin($1, $2, $3, $4, $5)",
                org_in.org_name,
                org_in.email,
                hashed_password,
                org_in.first_name,
                org_in.last_name
            )
            if not org_id:
                raise HTTPException(status_code=500, detail="Failed to create organization")

            user_row = await self.conn.fetchrow(
                "SELECT id, email, role, organization_id, is_email_verified, is_2fa_enabled, two_factor_type FROM v_users_canonical WHERE email = $1",
                org_in.email
            )

            refresh_token, session_id = await self.create_session(user_row["id"], ua_string, ip_address)

            browser, platform, _ = self.parse_user_agent(ua_string)
            await self.conn.execute(
                "SELECT fn_log_security_event($1, $2, $3, $4::entity_type_enum, $5, $6, $7::jsonb)",
                org_id, user_row["id"], "ORG_REGISTERED", "USER", user_row["id"], ip_address,
                json.dumps({"browser": browser, "platform": platform, "status": "Success", "email_verified": False})
            )

            user_data = dict(user_row)

            return {
                "organization": {"id": org_id, "name": org_in.org_name, "created_at": datetime.now(timezone.utc)},
                "user": user_data,
                "refresh_token": refresh_token,
                "session_id": session_id,
                "message": "Organization created successfully"
            }
        except asyncpg.exceptions.UniqueViolationError:
            raise HTTPException(status_code=409, detail="This email or organization name is already registered")
        except Exception as e:
            logger.error(f"Error in register_organization_direct: {e}")
            raise HTTPException(status_code=500, detail="An unexpected error occurred during organization creation")

    async def register_organization(self, org_in: OrganizationCreate, ua_string: str, ip_address: str) -> dict:
        """Legacy direct registration wrapper - now redirects through request_registration_otp."""
        return await self.request_registration_otp(org_in)


    async def login(self, user_in: UserLogin, ua_string: str, ip_address: str) -> dict:
        user_row = await self.conn.fetchrow(
            "SELECT id, email, first_name, password_hash, role, organization_id, is_2fa_enabled, two_factor_type FROM v_users_canonical WHERE email = $1",
            user_in.email
        )

        browser, platform, _ = self.parse_user_agent(ua_string)

        if not user_row or not verify_password(user_in.password, user_row["password_hash"]):
            if user_row:
                await self.conn.execute(
                    "SELECT fn_log_security_event($1, $2, $3, $4::entity_type_enum, $5, $6, $7::jsonb)",
                    user_row["organization_id"], user_row["id"], "FAILED_LOGIN", "USER", user_row["id"], ip_address, json.dumps({"browser": browser, "platform": platform, "status": "Failed", "reason": "Invalid credentials"})
                )
            raise HTTPException(status_code=401, detail="Invalid email or password")

        # If user has 2FA enabled, issue login OTP
        if user_row.get("is_2fa_enabled"):
            otp_row = await self.conn.fetchrow(
                "SELECT raw_otp, mfa_token, user_first_name FROM fn_create_otp_code($1, $2, $3, $4)",
                user_row["id"], user_row["email"], "LOGIN_2FA", 10
            )
            return {
                "otp_required": True,
                "mfa_token": otp_row["mfa_token"],
                "raw_otp": otp_row["raw_otp"],
                "user_first_name": otp_row["user_first_name"],
                "email": user_row["email"],
                "masked_email": mask_email(user_row["email"]),
                "message": f"2FA verification code sent to {mask_email(user_row['email'])}"
            }

        is_new_device = await self.conn.fetchval(
            "SELECT fn_check_is_new_device($1, $2, $3)",
            user_row["id"], browser, platform
        )

        refresh_token, session_id = await self.create_session(user_row["id"], ua_string, ip_address)

        action = "NEW_DEVICE_LOGIN" if is_new_device else "LOGIN"
        details = {
            "browser": browser,
            "platform": platform,
            "status": "Success",
            "is_new_device": bool(is_new_device)
        }

        await self.conn.execute(
            "SELECT fn_log_security_event($1, $2, $3, $4::entity_type_enum, $5, $6, $7::jsonb)",
            user_row["organization_id"], user_row["id"], action, "USER", user_row["id"], ip_address, json.dumps(details)
        )

        return {
            "otp_required": False,
            "user": dict(user_row),
            "refresh_token": refresh_token,
            "session_id": session_id,
            "message": "Login successful"
        }

    async def verify_login_otp(self, mfa_token: str, otp_code: str, ua_string: str, ip_address: str) -> dict:
        row = await self.conn.fetchrow(
            "SELECT success, error_code, user_id, email FROM fn_verify_otp_code($1, $2, 'LOGIN_2FA')",
            mfa_token, otp_code
        )
        if not row or not row["success"]:
            error_code = row["error_code"] if row else "TOKEN_INVALID"
            error_map = {
                "TOKEN_INVALID": "Invalid or expired login session",
                "OTP_EXPIRED": "2FA code has expired. Please request a new code.",
                "MAX_ATTEMPTS_EXCEEDED": "Too many failed attempts. Please request a new 2FA code.",
                "INVALID_OTP": "Incorrect 2FA verification code."
            }
            raise HTTPException(status_code=400, detail=error_map.get(error_code, "2FA verification failed"))

        user_row = await self.conn.fetchrow(
            "SELECT id, email, role, organization_id, is_email_verified, is_2fa_enabled, two_factor_type FROM v_users_canonical WHERE id = $1",
            row["user_id"]
        )
        if not user_row:
            raise HTTPException(status_code=404, detail="User not found")

        refresh_token, session_id = await self.create_session(user_row["id"], ua_string, ip_address)
        browser, platform, _ = self.parse_user_agent(ua_string)

        await self.conn.execute(
            "SELECT fn_log_security_event($1, $2, $3, $4::entity_type_enum, $5, $6, $7::jsonb)",
            user_row["organization_id"], user_row["id"], "LOGIN_2FA_SUCCESS", "USER", user_row["id"], ip_address,
            json.dumps({"browser": browser, "platform": platform, "status": "Success"})
        )

        return {
            "user": dict(user_row),
            "refresh_token": refresh_token,
            "session_id": session_id,
            "message": "2FA Login successful"
        }

    async def resend_otp(self, mfa_token: str) -> dict:
        row = await self.conn.fetchrow(
            "SELECT success, error_code, raw_otp, new_mfa_token, email, first_name, purpose, payload FROM fn_resend_otp_code($1)",
            mfa_token
        )
        if not row or not row["success"]:
            error_code = row["error_code"] if row else "TOKEN_INVALID"
            if error_code == "COOLDOWN_ACTIVE":
                raise HTTPException(status_code=429, detail="Please wait 60 seconds before requesting another code.")
            raise HTTPException(status_code=400, detail="Unable to resend OTP. Session may have expired.")

        return {
            "success": True,
            "raw_otp": row["raw_otp"],
            "new_mfa_token": row["new_mfa_token"],
            "email": row["email"],
            "masked_email": mask_email(row["email"]),
            "first_name": row["first_name"],
            "purpose": row["purpose"],
            "message": f"A new verification code has been sent to {mask_email(row['email'])}"
        }

    async def request_enable_2fa(self, current_user: dict, password: Optional[str] = None) -> dict:
        user_row = await self.conn.fetchrow(
            "SELECT id, email, password_hash, first_name, is_2fa_enabled FROM v_users_canonical WHERE id = $1",
            current_user["id"]
        )
        if not user_row:
            raise HTTPException(status_code=404, detail="User not found")

        if password and not verify_password(password, user_row["password_hash"]):
            raise HTTPException(status_code=401, detail="Incorrect password")

        otp_row = await self.conn.fetchrow(
            "SELECT raw_otp, mfa_token, user_first_name FROM fn_create_otp_code($1, $2, $3, $4)",
            user_row["id"], user_row["email"], "ENABLE_2FA", 10
        )

        return {
            "mfa_token": otp_row["mfa_token"],
            "raw_otp": otp_row["raw_otp"],
            "email": user_row["email"],
            "masked_email": mask_email(user_row["email"]),
            "first_name": user_row["first_name"],
            "message": f"Verification code sent to {mask_email(user_row['email'])}"
        }

    async def confirm_enable_2fa(self, current_user: dict, mfa_token: str, otp_code: str, ua_string: str, ip_address: str) -> dict:
        row = await self.conn.fetchrow(
            "SELECT success, error_code, user_id FROM fn_verify_otp_code($1, $2, 'ENABLE_2FA')",
            mfa_token, otp_code
        )
        if not row or not row["success"] or row["user_id"] != current_user["id"]:
            error_code = row["error_code"] if row else "TOKEN_INVALID"
            error_map = {
                "TOKEN_INVALID": "Invalid verification session",
                "OTP_EXPIRED": "Verification code has expired.",
                "MAX_ATTEMPTS_EXCEEDED": "Too many failed attempts. Please request a new code.",
                "INVALID_OTP": "Incorrect verification code."
            }
            raise HTTPException(status_code=400, detail=error_map.get(error_code, "2FA setup failed"))

        await self.conn.execute(
            "SELECT fn_set_user_2fa($1, TRUE, 'email')",
            current_user["id"]
        )

        browser, platform, _ = self.parse_user_agent(ua_string)
        org_id = current_user.get("organization_id")
        if not org_id:
            org_id = await self.conn.fetchval("SELECT organization_id FROM v_users_canonical WHERE id = $1", current_user["id"])

        await self.conn.execute(
            "SELECT fn_log_security_event($1, $2, $3, $4::entity_type_enum, $5, $6, $7::jsonb)",
            org_id, current_user["id"], "2FA_ENABLED", "USER", current_user["id"], ip_address,
            json.dumps({"browser": browser, "platform": platform, "type": "email"})
        )

        return {"message": "Two-factor authentication (2FA) enabled successfully"}

    async def disable_2fa(self, current_user: dict, password: str, ua_string: str, ip_address: str) -> dict:
        user_row = await self.conn.fetchrow(
            "SELECT id, password_hash FROM v_users_canonical WHERE id = $1",
            current_user["id"]
        )
        if not user_row or not verify_password(password, user_row["password_hash"]):
            raise HTTPException(status_code=401, detail="Incorrect password")

        await self.conn.execute(
            "SELECT fn_set_user_2fa($1, FALSE, 'email')",
            current_user["id"]
        )

        browser, platform, _ = self.parse_user_agent(ua_string)
        org_id = current_user.get("organization_id")
        if not org_id:
            org_id = await self.conn.fetchval("SELECT organization_id FROM v_users_canonical WHERE id = $1", current_user["id"])

        await self.conn.execute(
            "SELECT fn_log_security_event($1, $2, $3, $4::entity_type_enum, $5, $6, $7::jsonb)",
            org_id, current_user["id"], "2FA_DISABLED", "USER", current_user["id"], ip_address,
            json.dumps({"browser": browser, "platform": platform})
        )

        return {"message": "Two-factor authentication disabled"}

    async def refresh_token(self, token: str, ua_string: str, ip_address: str) -> dict:
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        new_refresh_token = secrets.token_urlsafe(64)
        new_token_hash = hashlib.sha256(new_refresh_token.encode()).hexdigest()
        expires_at = datetime.now(timezone.utc) + timedelta(days=7)
        browser, platform, _ = self.parse_user_agent(ua_string)

        row = await self.conn.fetchrow(
            "SELECT session_id, user_id FROM fn_refresh_user_session($1, $2, $3, $4, $5, $6)",
            token_hash, new_token_hash, expires_at, browser, platform, ip_address
        )

        if not row or not row["session_id"]:
            raise HTTPException(status_code=401, detail="Session expired or revoked")

        user_row = await self.conn.fetchrow(
            "SELECT id, email, role, organization_id, is_email_verified, is_2fa_enabled, two_factor_type FROM v_users_canonical WHERE id = $1",
            row["user_id"]
        )
        if not user_row:
            raise HTTPException(status_code=401, detail="User not found")

        return {
            "user": dict(user_row),
            "refresh_token": new_refresh_token,
            "session_id": row["session_id"],
            "message": "Token refreshed"
        }

    async def get_me(self, current_user: dict) -> dict:
        user_row = await self.conn.fetchrow(
            "SELECT id, email, first_name, last_name, avatar_url, role, organization_id, is_email_verified, is_2fa_enabled, two_factor_type FROM v_users_canonical WHERE id = $1",
            current_user["id"]
        )
        if not user_row:
            raise HTTPException(status_code=404, detail="User not found")
        return dict(user_row)

    async def logout(self, token: Optional[str]):
        if token:
            token_hash = hashlib.sha256(token.encode()).hexdigest()
            await self.conn.execute(
                "SELECT fn_revoke_session_by_token_hash($1)",
                token_hash
            )

    async def get_sessions(self, current_token: Optional[str], current_user: dict) -> List[dict]:
        current_token_hash = hashlib.sha256(current_token.encode()).hexdigest() if current_token else ""
        current_session_id = current_user.get("session_id")

        rows = await self.conn.fetch(
            "SELECT id, browser, platform, device_name, ip_address, last_active_at, created_at, refresh_token_hash FROM fn_get_user_sessions($1)",
            current_user["id"]
        )
        
        sessions = []
        for row in rows:
            session_dict = dict(row)
            session_dict["is_current"] = (
                (current_session_id is not None and row["id"] == current_session_id) or
                (bool(current_token_hash) and row["refresh_token_hash"] == current_token_hash)
            )
            sessions.append(session_dict)
            
        return sessions

    async def delete_other_sessions(self, current_user: dict, current_token: Optional[str] = None, ua_string: str = "Unknown", ip_address: str = "Unknown"):
        current_session_id = current_user.get("session_id")
        current_token_hash = hashlib.sha256(current_token.encode()).hexdigest() if current_token else None

        await self.conn.execute(
            "SELECT fn_revoke_other_user_sessions($1, $2, $3)",
            current_user["id"], current_session_id, current_token_hash
        )

        org_id = current_user.get("organization_id")
        if not org_id:
            org_id = await self.conn.fetchval(
                "SELECT organization_id FROM v_users_canonical WHERE id = $1",
                current_user["id"]
            )

        browser, platform, _ = self.parse_user_agent(ua_string)
        await self.conn.execute(
            "SELECT fn_log_security_event($1, $2, $3, $4::entity_type_enum, $5, $6, $7::jsonb)",
            org_id,
            current_user["id"],
            "REVOKED_OTHER_SESSIONS",
            "USER",
            current_user["id"],
            ip_address,
            json.dumps({"browser": browser, "platform": platform, "status": "Success"})
        )

    async def create_password_reset_token(self, email: str) -> dict | None:
        clean_email = email.strip().lower()
        row = await self.conn.fetchrow(
            "SELECT * FROM fn_create_password_reset_token($1)", clean_email
        )
        if not row:
            return None
        return {"raw_token": row["raw_token"], "user_first_name": row["user_first_name"]}

    async def reset_password(self, token: str, new_password_hash: str) -> dict:
        row = await self.conn.fetchrow(
            "SELECT * FROM fn_reset_password($1, $2)", token, new_password_hash
        )
        return {"success": row["success"], "error_code": row["error_code"]}

    async def create_email_verification_token(self, user_id: int) -> str:
        raw_token = await self.conn.fetchval(
            "SELECT fn_create_email_verification_token($1)", user_id
        )
        return raw_token

    async def verify_email(self, token: str) -> dict:
        row = await self.conn.fetchrow(
            "SELECT * FROM fn_verify_email($1)", token
        )
        return {"success": row["success"], "error_code": row["error_code"]}

    async def get_security_events(self, current_user: dict) -> List[dict]:
        rows = await self.conn.fetch(
            "SELECT id, action, ip_address, details, created_at FROM fn_get_user_security_events($1, 50)",
            current_user["id"]
        )
        
        events = []
        for row in rows:
            event = dict(row)
            if isinstance(event.get("details"), str):
                try:
                    event["details"] = json.loads(event["details"])
                except:
                    event["details"] = {}
            events.append(event)
            
        return events

    async def delete_account(self, current_user: dict, password: str, ua_string: str, ip_address: str) -> None:
        """Hard-delete the authenticated user's account and all associated data."""
        # 1. Verify password in Python (consistent with change_password / disable_2fa patterns)
        user_row = await self.conn.fetchrow(
            "SELECT id, password_hash, organization_id FROM v_users_canonical WHERE id = $1",
            current_user["id"]
        )
        if not user_row:
            raise HTTPException(status_code=404, detail="User not found")

        if not verify_password(password, user_row["password_hash"]):
            raise HTTPException(status_code=401, detail="Incorrect password")

        # 2. Call stored procedure — atomically handles all cascades and guard checks
        row = await self.conn.fetchrow(
            "SELECT success, error_code FROM fn_hard_delete_account($1)",
            current_user["id"]
        )

        if not row or not row["success"]:
            error_code = row["error_code"] if row else "UNKNOWN"
            error_map = {
                "USER_NOT_FOUND": (404, "Account not found or already deleted"),
                "LAST_ADMIN": (403, "You are the only administrator of this organization. Transfer ownership or delete the organization before deleting your account."),
            }
            status_code, detail = error_map.get(error_code, (500, "Failed to delete account"))
            raise HTTPException(status_code=status_code, detail=detail)