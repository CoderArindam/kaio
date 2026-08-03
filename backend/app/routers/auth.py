import logging
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response, Request
from fastapi.responses import JSONResponse
from typing import List

from app.schemas.auth import (
    OrganizationCreate,
    OrganizationRegistrationResponse,
    RegisterInitResponse,
    RegisterVerifyRequest,
    UserLogin,
    LoginResponse,
    SuccessResponse,
    UserResponse,
    SessionResponse,
    SecurityEventResponse,
    PasswordPolicy,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    OTPVerifyRequest,
    OTPResendRequest,
    Enable2FARequest,
    Confirm2FARequest,
    Disable2FARequest,
)
from app.services.email_service import send_email
from app.services.email_templates import (
    generate_password_reset_email,
    generate_email_verification_email,
    generate_otp_email,
)
from app.auth.password import get_password_hash
from app.auth.jwt import create_access_token
from app.auth.dependencies import get_current_user
from app.database.connection import get_db_connection
from app.services.auth_service import AuthService
from app.config.settings import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])

def is_secure_cookie(request: Request = None) -> bool:
    if settings.COOKIE_SECURE:
        return True
    if settings.ENVIRONMENT.lower() in ("production", "prod", "staging"):
        return True
    if request:
        proto = request.headers.get("x-forwarded-proto", request.url.scheme)
        if proto.lower() == "https":
            return True
    origins = settings.FRONTEND_ORIGINS.lower()
    return "https://" in origins or "vercel.app" in origins

def set_auth_cookies(response: Response, access_token: str, refresh_token: str, request: Request = None):
    secure_flag = is_secure_cookie(request)
    samesite_val = "none" if secure_flag else "lax"
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=secure_flag,
        samesite=samesite_val,
        path="/",
        max_age=15 * 60 # 15 minutes
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=secure_flag,
        samesite=samesite_val,
        path="/",
        max_age=7 * 24 * 60 * 60 # 7 days
    )

def get_auth_service(conn = Depends(get_db_connection)) -> AuthService:
    return AuthService(conn)


@router.post("/register", response_model=RegisterInitResponse)
async def register_organization(
    org_in: OrganizationCreate,
    background_tasks: BackgroundTasks,
    auth_service: AuthService = Depends(get_auth_service)
):
    """Step 1: Init registration & send 6-digit OTP to Admin Email."""
    result = await auth_service.request_registration_otp(org_in)

    subject, text_body, html_body = generate_otp_email(
        first_name=result["first_name"],
        otp_code=result["raw_otp"],
        purpose_title="Organization Registration",
        expiry_minutes=10
    )
    background_tasks.add_task(send_email, result["email"], subject, text_body, html_body)

    return {
        "otp_required": True,
        "registration_token": result["registration_token"],
        "email": result["masked_email"],
        "message": result["message"]
    }


@router.post("/register/verify-otp", response_model=OrganizationRegistrationResponse, status_code=201)
async def verify_registration_otp(
    body: RegisterVerifyRequest,
    request: Request,
    response: Response,
    auth_service: AuthService = Depends(get_auth_service)
):
    """Step 2: Verify OTP code & execute organization + admin creation."""
    ua_string = request.headers.get("user-agent", "Unknown")[:255]
    ip_address = request.client.host if request.client else "Unknown"

    result = await auth_service.verify_registration_otp(
        body.registration_token,
        body.otp_code,
        ua_string,
        ip_address
    )

    access_token = create_access_token(data={
        "user_id": result["user"]["id"],
        "email": result["user"]["email"],
        "role": result["user"]["role"],
        "organization_id": result["user"]["organization_id"],
        "session_id": result["session_id"]
    })

    set_auth_cookies(response, access_token, result["refresh_token"], request)

    return {
        "organization": result["organization"],
        "message": result["message"]
    }


@router.post("/login")
async def login(
    user_in: UserLogin,
    request: Request,
    response: Response,
    background_tasks: BackgroundTasks,
    auth_service: AuthService = Depends(get_auth_service)
):
    ua_string = request.headers.get("user-agent", "Unknown")[:255]
    ip_address = request.client.host if request.client else "Unknown"

    result = await auth_service.login(user_in, ua_string, ip_address)

    if result.get("otp_required"):
        subject, text_body, html_body = generate_otp_email(
            first_name=result.get("user_first_name") or "there",
            otp_code=result["raw_otp"],
            purpose_title="2FA Login",
            expiry_minutes=10
        )
        background_tasks.add_task(send_email, result["email"], subject, text_body, html_body)

        return {
            "message": result["message"],
            "otp_required": True,
            "mfa_token": result["mfa_token"],
            "email": result["masked_email"]
        }

    access_token = create_access_token(data={
        "user_id": result["user"]["id"],
        "email": result["user"]["email"],
        "role": result["user"]["role"],
        "organization_id": result["user"]["organization_id"],
        "session_id": result["session_id"]
    })

    set_auth_cookies(response, access_token, result["refresh_token"], request)

    return {
        "message": result["message"],
        "otp_required": False
    }


@router.post("/login/verify-otp", response_model=SuccessResponse)
async def verify_login_otp(
    body: OTPVerifyRequest,
    request: Request,
    response: Response,
    auth_service: AuthService = Depends(get_auth_service)
):
    ua_string = request.headers.get("user-agent", "Unknown")[:255]
    ip_address = request.client.host if request.client else "Unknown"

    result = await auth_service.verify_login_otp(body.mfa_token, body.otp_code, ua_string, ip_address)

    access_token = create_access_token(data={
        "user_id": result["user"]["id"],
        "email": result["user"]["email"],
        "role": result["user"]["role"],
        "organization_id": result["user"]["organization_id"],
        "session_id": result["session_id"]
    })

    set_auth_cookies(response, access_token, result["refresh_token"], request)

    return {"message": result["message"]}


@router.post("/otp/resend")
async def resend_otp(
    body: OTPResendRequest,
    background_tasks: BackgroundTasks,
    auth_service: AuthService = Depends(get_auth_service)
):
    result = await auth_service.resend_otp(body.mfa_token)

    purpose_title = "Verification Code"
    if result["purpose"] == "ORG_REGISTRATION":
        purpose_title = "Organization Registration"
    elif result["purpose"] == "LOGIN_2FA":
        purpose_title = "2FA Login"
    elif result["purpose"] == "ENABLE_2FA":
        purpose_title = "2FA Activation"

    subject, text_body, html_body = generate_otp_email(
        first_name=result.get("first_name") or "there",
        otp_code=result["raw_otp"],
        purpose_title=purpose_title,
        expiry_minutes=10
    )
    background_tasks.add_task(send_email, result["email"], subject, text_body, html_body)

    return {
        "message": result["message"],
        "new_mfa_token": result["new_mfa_token"]
    }


@router.post("/2fa/enable")
async def request_enable_2fa(
    body: Enable2FARequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
    auth_service: AuthService = Depends(get_auth_service)
):
    result = await auth_service.request_enable_2fa(current_user, body.password)

    subject, text_body, html_body = generate_otp_email(
        first_name=result.get("first_name") or "there",
        otp_code=result["raw_otp"],
        purpose_title="2FA Activation",
        expiry_minutes=10
    )
    background_tasks.add_task(send_email, result["email"], subject, text_body, html_body)

    return {
        "message": result["message"],
        "mfa_token": result["mfa_token"],
        "email": result["masked_email"]
    }


@router.post("/2fa/confirm-enable", response_model=SuccessResponse)
async def confirm_enable_2fa(
    body: Confirm2FARequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
    auth_service: AuthService = Depends(get_auth_service)
):
    ua_string = request.headers.get("user-agent", "Unknown")[:255]
    ip_address = request.client.host if request.client else "Unknown"

    result = await auth_service.confirm_enable_2fa(
        current_user,
        body.mfa_token,
        body.otp_code,
        ua_string,
        ip_address
    )
    return result


@router.post("/2fa/disable", response_model=SuccessResponse)
async def disable_2fa(
    body: Disable2FARequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
    auth_service: AuthService = Depends(get_auth_service)
):
    ua_string = request.headers.get("user-agent", "Unknown")[:255]
    ip_address = request.client.host if request.client else "Unknown"

    result = await auth_service.disable_2fa(current_user, body.password, ua_string, ip_address)
    return result


@router.post("/refresh", response_model=SuccessResponse)
async def refresh_token(
    request: Request,
    response: Response,
    auth_service: AuthService = Depends(get_auth_service)
):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="Refresh token missing")

    ua_string = request.headers.get("user-agent", "Unknown")[:255]
    ip_address = request.client.host if request.client else "Unknown"

    result = await auth_service.refresh_token(token, ua_string, ip_address)
    
    access_token = create_access_token(data={
        "user_id": result["user"]["id"],
        "email": result["user"]["email"],
        "role": result["user"]["role"],
        "organization_id": result["user"]["organization_id"],
        "session_id": result["session_id"]
    })
    
    set_auth_cookies(response, access_token, result["refresh_token"], request)

    return {"message": result["message"]}


@router.get("/me", response_model=UserResponse)
async def get_me(
    current_user: dict = Depends(get_current_user),
    auth_service: AuthService = Depends(get_auth_service)
):
    user = await auth_service.get_me(current_user)
    return user


@router.post("/logout", response_model=SuccessResponse)
async def logout(
    request: Request,
    response: Response,
    auth_service: AuthService = Depends(get_auth_service)
):
    token = request.cookies.get("refresh_token")
    await auth_service.logout(token)

    secure_flag = is_secure_cookie(request)
    samesite_val = "none" if secure_flag else "lax"
    response.delete_cookie(key="access_token", httponly=True, secure=secure_flag, samesite=samesite_val, path="/")
    response.delete_cookie(key="refresh_token", httponly=True, secure=secure_flag, samesite=samesite_val, path="/")
    
    return {"message": "Logged out successfully"}


@router.get("/sessions", response_model=List[SessionResponse])
async def get_sessions(
    request: Request,
    current_user: dict = Depends(get_current_user),
    auth_service: AuthService = Depends(get_auth_service)
):
    current_token = request.cookies.get("refresh_token")
    sessions = await auth_service.get_sessions(current_token, current_user)
    return sessions


@router.delete("/sessions/other", response_model=SuccessResponse)
async def delete_other_sessions(
    request: Request,
    current_user: dict = Depends(get_current_user),
    auth_service: AuthService = Depends(get_auth_service)
):
    current_token = request.cookies.get("refresh_token")
    ua_string = request.headers.get("user-agent", "Unknown")[:255]
    ip_address = request.client.host if request.client else "Unknown"
    await auth_service.delete_other_sessions(current_user, current_token, ua_string, ip_address)
    return {"message": "Other sessions revoked successfully"}


@router.get("/security-events", response_model=List[SecurityEventResponse])
async def get_security_events(
    current_user: dict = Depends(get_current_user),
    auth_service: AuthService = Depends(get_auth_service)
):
    events = await auth_service.get_security_events(current_user)
    return events


@router.get("/password-policy", response_model=PasswordPolicy)
async def get_password_policy():
    return {
        "min_length": 8,
        "require_uppercase": True,
        "require_lowercase": True,
        "require_number": True,
        "require_special": True
    }


@router.post("/forgot-password")
async def forgot_password(
    body: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    auth_service: AuthService = Depends(get_auth_service),
):
    result = await auth_service.create_password_reset_token(body.email)

    if result is not None:
        reset_url = f"{settings.FRONTEND_ORIGINS.split(',')[0].strip()}/reset-password?token={result['raw_token']}"
        subject, text_body, html_body = generate_password_reset_email(result["user_first_name"] or "there", reset_url)
        background_tasks.add_task(send_email, body.email, subject, text_body, html_body)

    return {"data": {"message": "If that email is registered, a reset link has been sent."}}


@router.post("/reset-password")
async def reset_password(
    body: ResetPasswordRequest,
    auth_service: AuthService = Depends(get_auth_service),
):
    hashed_password = get_password_hash(body.new_password)
    result = await auth_service.reset_password(body.token, hashed_password)

    if not result["success"]:
        error_messages = {
            "TOKEN_INVALID": "This reset link is invalid. Please request a new one.",
            "TOKEN_EXPIRED": "This reset link has expired. Please request a new one.",
        }
        return JSONResponse(
            status_code=400,
            content={
                "detail": error_messages.get(result["error_code"], "An error occurred."),
                "error_code": result["error_code"],
            },
        )

    return {"data": {"message": "Password reset successfully. Please log in."}}


@router.post("/send-verification-email")
async def send_verification_email(
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
    auth_service: AuthService = Depends(get_auth_service),
):
    raw_token = await auth_service.create_email_verification_token(current_user["id"])
    verify_url = f"{settings.FRONTEND_ORIGINS.split(',')[0].strip()}/verify-email?token={raw_token}"

    user_row = await auth_service.get_me(current_user)
    subject, text_body, html_body = generate_email_verification_email(user_row.get("first_name") or "there", verify_url)
    background_tasks.add_task(send_email, user_row["email"], subject, text_body, html_body)

    return {"data": {"message": "Verification email sent."}}


@router.get("/verify-email")
async def verify_email(
    token: str = Query(...),
    auth_service: AuthService = Depends(get_auth_service),
):
    result = await auth_service.verify_email(token)

    if not result["success"]:
        error_messages = {
            "TOKEN_INVALID": "This verification link is invalid.",
            "TOKEN_EXPIRED": "This verification link has expired.",
        }
        return JSONResponse(
            status_code=400,
            content={
                "detail": error_messages.get(result["error_code"], "An error occurred."),
                "error_code": result["error_code"],
            },
        )

    return {"data": {"message": "Email verified successfully."}}
