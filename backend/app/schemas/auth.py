from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime


# --- Organization ---

class OrganizationCreate(BaseModel):
    """Used to register a new organization + its first SUPER_ADMIN."""
    org_name: str
    email: EmailStr
    password: str
    first_name: str
    last_name: Optional[str] = None


class OrganizationResponse(BaseModel):
    id: int
    name: str
    created_at: datetime
    subscription_plan: Optional[str] = "FREE"
    onboarding_completed: bool = False


class OrganizationRegistrationResponse(BaseModel):
    organization: OrganizationResponse
    user: Optional["UserResponse"] = None
    message: str = "Registration successful"


class RegisterInitResponse(BaseModel):
    otp_required: bool = True
    registration_token: str
    email: str
    message: str = "Verification OTP sent to your email address."


class RegisterVerifyRequest(BaseModel):
    registration_token: str
    otp_code: str = Field(min_length=6, max_length=6)


class RegisterSkipOtpRequest(BaseModel):
    registration_token: str


# --- Auth ---

class UserLogin(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    message: str
    otp_required: bool = False
    mfa_token: Optional[str] = None
    email: Optional[str] = None


class SuccessResponse(BaseModel):
    message: str


class UserResponse(BaseModel):
    id: int
    email: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    avatar_url: Optional[str] = None
    role: Optional[str] = None
    organization_id: Optional[int] = None
    is_email_verified: bool = True
    is_2fa_enabled: bool = False
    two_factor_type: Optional[str] = "email"
    org_subscription_plan: Optional[str] = None
    org_onboarding_completed: Optional[bool] = None


class SessionResponse(BaseModel):
    id: int
    browser: Optional[str] = None
    platform: Optional[str] = None
    device_name: Optional[str] = None
    ip_address: Optional[str] = None
    last_active_at: Optional[datetime] = None
    created_at: datetime
    is_current: bool = False


class SecurityEventResponse(BaseModel):
    id: int
    action: str
    ip_address: Optional[str] = None
    details: Optional[dict] = None
    created_at: datetime


class PasswordPolicy(BaseModel):
    min_length: int
    require_uppercase: bool
    require_lowercase: bool
    require_number: bool
    require_special: bool


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8)


# --- OTP & 2FA Schemas ---

class OTPVerifyRequest(BaseModel):
    mfa_token: str
    otp_code: str = Field(min_length=6, max_length=6)


class OTPResendRequest(BaseModel):
    mfa_token: str


class Enable2FARequest(BaseModel):
    password: Optional[str] = None


class Confirm2FARequest(BaseModel):
    mfa_token: str
    otp_code: str = Field(min_length=6, max_length=6)


class Disable2FARequest(BaseModel):
    password: str


class DeleteAccountRequest(BaseModel):
    password: str
