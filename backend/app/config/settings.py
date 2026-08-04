import logging
from typing import Optional
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger("kaio.settings")


class Settings(BaseSettings):
    ENVIRONMENT: str = "production"
    LOG_LEVEL: str = "INFO"

    DATABASE_URL: str
    JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    SMTP_EMAIL: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None

    # Brevo Integration
    BREVO_API_KEY: Optional[str] = None
    BREVO_SENDER_EMAIL: Optional[str] = "coderarindam@gmail.com"

    # Resend Integration
    RESEND_API_KEY: Optional[str] = None
    RESEND_SENDER_EMAIL: Optional[str] = "onboarding@resend.dev"

    FRONTEND_ORIGINS: str = "http://localhost:5173,http://localhost:3000"
    COOKIE_SECURE: bool = False

    # Cloudinary Integration
    CLOUDINARY_CLOUD_NAME: Optional[str] = None
    CLOUDINARY_API_KEY: Optional[str] = None
    CLOUDINARY_API_SECRET: Optional[str] = None
    CLOUDINARY_URL: Optional[str] = None

    # Production Hardening Controls
    MAX_REQUEST_SIZE_BYTES: int = 52_428_800  # 50 MB
    RATE_LIMIT_PER_MINUTE: int = 300           # 300 requests per IP per min

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @field_validator("JWT_SECRET")
    @classmethod
    def validate_jwt_secret(cls, v: str) -> str:
        if not v or v.strip() in ("change_me", "secret", "jwt_secret"):
            logger.warning("JWT_SECRET is using a default placeholder value. Ensure it is updated for production.")
        elif len(v) < 16:
            logger.warning("JWT_SECRET is shorter than 16 characters.")
        return v

    @field_validator("FRONTEND_ORIGINS")
    @classmethod
    def validate_origins(cls, v: str) -> str:
        if "*" in [o.strip() for o in v.split(",")]:
            logger.warning("FRONTEND_ORIGINS contains wildcard '*'. Ensure CORS origins are restricted in production.")
        return v


settings = Settings()

