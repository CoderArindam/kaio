from app.ai.providers.openai import OpenAIProvider
from app.ai.exceptions import AuthenticationError
from openai import AsyncOpenAI


class OpenRouterProvider(OpenAIProvider):
    """OpenRouter provider — OpenAI-compatible API with free model access."""
    provider_name: str = "OpenRouter"

    def __init__(
        self,
        api_key: str,
        model: str = "openai/gpt-oss-20b:free",
        base_url: str = "https://openrouter.ai/api/v1",
    ):
        self.provider_name = "OpenRouter"
        self.api_key = api_key
        self.model = model

        if not self.api_key:
            raise AuthenticationError("OpenRouter API key is missing.")

        self.client = AsyncOpenAI(
            api_key=self.api_key,
            base_url=base_url,
            default_headers={
                "HTTP-Referer": "https://kaio.app",
                "X-Title": "KAIO",
            },
        )
