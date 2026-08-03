import logging
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response, Request
from fastapi.responses import JSONResponse
from typing import List

from app.schemas.auth import (
    OrganizationCreate,
    OrganizationRegistrationResponse,
    UserLogin,
    SuccessResponse,
    UserResponse,
    SessionResponse,
    SecurityEventResponse,
    PasswordPolicy,
    ForgotPasswordRequest,
    ResetPasswordRequest,
)
from app.services.email_service import send_email
from app.services.email_templates import generate_password_reset_email, generate_email_verification_email
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

@router.post("/register", response_model=OrganizationRegistrationResponse, status_code=201)
async def register_organization(
    org_in: OrganizationCreate,
    request: Request,
    response: Response,
    auth_service: AuthService = Depends(get_auth_service)
):
    ua_string = request.headers.get("user-agent", "Unknown")[:255]
    ip_address = request.client.host if request.client else "Unknown"

    result = await auth_service.register_organization(org_in, ua_string, ip_address)

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

@router.post("/login", response_model=SuccessResponse)
async def login(
    user_in: UserLogin,
    request: Request,
    response: Response,
    auth_service: AuthService = Depends(get_auth_service)
):
    ua_string = request.headers.get("user-agent", "Unknown")[:255]
    ip_address = request.client.host if request.client else "Unknown"

    result = await auth_service.login(user_in, ua_string, ip_address)

    access_token = create_access_token(data={
        "user_id": result["user"]["id"],
        "email": result["user"]["email"],
        "role": result["user"]["role"],
        "organization_id": result["user"]["organization_id"],
        "session_id": result["session_id"]
    })

    set_auth_cookies(response, access_token, result["refresh_token"], request)

    return {"message": result["message"]}

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
        subject, email_body = generate_password_reset_email(result["user_first_name"] or "there", reset_url)
        background_tasks.add_task(send_email, body.email, subject, email_body)

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
    subject, email_body = generate_email_verification_email(user_row.get("first_name") or "there", verify_url)
    background_tasks.add_task(send_email, user_row["email"], subject, email_body)

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
