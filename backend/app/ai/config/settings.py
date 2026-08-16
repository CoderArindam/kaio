from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class AISettings(BaseSettings):
    AI_ENABLED: bool = True
    AI_PROVIDER: str = "openrouter"
    AI_MODEL: str = "openai/gpt-oss-20b:free"
    AI_TIMEOUT: int = 60
    AI_MAX_RETRIES: int = 3
    AI_TEMPERATURE: float = 0.0
    AI_MAX_TOKENS: int = 2000
    AI_LOG_LEVEL: str = "INFO"

    OPENAI_API_KEY: Optional[str] = None
    ANTHROPIC_API_KEY: Optional[str] = None
    GEMINI_API_KEY: Optional[str] = None
    AZURE_OPENAI_KEY: Optional[str] = None
    PUTER_API_KEY: Optional[str] = None
    OPENROUTER_API_KEY: Optional[str] = None
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


ai_settings = AISettings()
