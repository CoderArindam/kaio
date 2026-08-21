from typing import Any, Dict, List, Optional
from app.ai.providers.openai import OpenAIProvider
from app.ai.exceptions import AuthenticationError, ProviderError
from openai import AsyncOpenAI
import json


class OpenRouterProvider(OpenAIProvider):
    """OpenRouter provider — OpenAI-compatible API with free model access and auto-fallback."""
    provider_name: str = "OpenRouter"

    FALLBACK_MODELS = [
        "nvidia/nemotron-3-ultra-550b-a55b:free",
        "liquid/lfm-2.5-2.6b:free",
        "dots-studio/dots-3-note-preview:free",
    ]

    def __init__(
        self,
        api_key: str,
        model: str = "nvidia/nemotron-3-ultra-550b-a55b:free",
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

    def _get_models_list(self) -> List[str]:
        models = [self.model]
        for fb in self.FALLBACK_MODELS:
            if fb != self.model and len(models) < 3:
                models.append(fb)
        return models

    async def generate(
        self,
        messages: List[Dict[str, Any]],
        temperature: float = 0.0,
        max_tokens: int = 2000,
        response_format: Optional[Dict[str, Any]] = None,
        tools: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        if not self.api_key:
            raise AuthenticationError(f"{self.provider_name} API key is missing.")

        kwargs = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "timeout": 30.0,
            "extra_body": {"models": self._get_models_list()},
        }

        if response_format:
            kwargs["response_format"] = {"type": "json_object"}

        if tools:
            formatted_tools = []
            for tool in tools:
                formatted_tools.append({
                    "type": "function",
                    "function": {
                        "name": tool["name"],
                        "description": tool["description"],
                        "parameters": tool.get("parameters", {}),
                    },
                })
            kwargs["tools"] = formatted_tools

        try:
            response = await self.client.chat.completions.create(**kwargs)
            message = response.choices[0].message
            content = message.content or ""

            tool_calls = []
            if message.tool_calls:
                for tc in message.tool_calls:
                    if tc.type == "function":
                        tool_calls.append({
                            "name": tc.function.name,
                            "args": json.loads(tc.function.arguments),
                        })

            return {
                "content": content,
                "tool_calls": tool_calls,
                "usage": {
                    "prompt_tokens": getattr(response.usage, "prompt_tokens", 0) if response.usage else 0,
                    "completion_tokens": getattr(response.usage, "completion_tokens", 0) if response.usage else 0,
                    "total_tokens": getattr(response.usage, "total_tokens", 0) if response.usage else 0,
                },
            }
        except Exception as e:
            raise ProviderError(f"{self.provider_name} API Error: {str(e)}")

    async def stream(
        self,
        messages: List[Dict[str, Any]],
        temperature: float = 0.0,
        max_tokens: int = 2000,
        tools: Optional[List[Dict[str, Any]]] = None,
    ):
        kwargs = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
            "timeout": 30.0,
            "extra_body": {"models": self._get_models_list()},
        }

        try:
            stream = await self.client.chat.completions.create(**kwargs)
            async for chunk in stream:
                if len(chunk.choices) > 0:
                    delta = chunk.choices[0].delta
                    if delta.content:
                        yield {"content": delta.content}
        except Exception as e:
            raise ProviderError(f"{self.provider_name} Stream Error: {str(e)}")
