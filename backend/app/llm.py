"""The LLM providers that can write a summary narrative.

Three are supported, chosen by which API key is configured: DeepSeek and
OpenAI through the OpenAI SDK (DeepSeek speaks the same chat API), and
Anthropic through its own SDK. Each call either returns text or raises
LlmError with a reason that is safe to show a user; nothing here ever logs or
returns the prompt, which contains patient data.
"""

from dataclasses import dataclass
from enum import StrEnum

import anthropic
import openai

from app.config import Settings


class Provider(StrEnum):
    DEEPSEEK = "deepseek"
    OPENAI = "openai"
    ANTHROPIC = "anthropic"


PROVIDER_LABELS = {
    Provider.DEEPSEEK: "DeepSeek",
    Provider.OPENAI: "OpenAI",
    Provider.ANTHROPIC: "Anthropic",
}

# The narrative itself is one paragraph, but a model that reasons first spends
# from the same allowance. A tight cap can be used up before any answer is
# written, which comes back as an empty response.
NARRATIVE_MAX_TOKENS = 7000


@dataclass(frozen=True)
class LlmTarget:
    """One provider, ready to call."""

    provider: Provider
    model: str
    api_key: str
    timeout_seconds: float
    base_url: str | None = None


class LlmError(Exception):
    """A provider call failed. The message is a short reason, fit for the UI."""


def configured_targets(settings: Settings) -> dict[Provider, LlmTarget]:
    """The providers that have an API key, in order of preference."""
    candidates = [
        (Provider.DEEPSEEK, settings.deepseek_api_key, settings.deepseek_model),
        (Provider.OPENAI, settings.openai_api_key, settings.openai_model),
        (Provider.ANTHROPIC, settings.anthropic_api_key, settings.anthropic_model),
    ]
    targets: dict[Provider, LlmTarget] = {}
    for provider, secret, model in candidates:
        # An empty value (e.g. `DEEPSEEK_API_KEY=` in .env) means "not set".
        key = secret.get_secret_value().strip() if secret else ""
        if key:
            targets[provider] = LlmTarget(
                provider=provider,
                model=model,
                api_key=key,
                timeout_seconds=settings.summary_timeout_seconds,
                base_url=settings.deepseek_base_url if provider is Provider.DEEPSEEK else None,
            )
    return targets


def complete(target: LlmTarget, system: str, user: str) -> str:
    """Ask the provider for a completion. Returns non-empty text or raises LlmError."""
    if target.provider is Provider.ANTHROPIC:
        text = _complete_anthropic(target, system, user)
    else:
        text = _complete_openai_compatible(target, system, user)
    text = text.strip()
    if not text:
        raise LlmError("the model returned an empty answer")
    return text


def _complete_openai_compatible(target: LlmTarget, system: str, user: str) -> str:
    client = openai.OpenAI(
        api_key=target.api_key,
        base_url=target.base_url,
        timeout=target.timeout_seconds,
        max_retries=1,
    )
    # DeepSeek takes the classic max_tokens. OpenAI's current models reject it
    # in favour of their own limit parameter, so OpenAI is left at its default.
    limits = {"max_tokens": NARRATIVE_MAX_TOKENS} if target.provider is Provider.DEEPSEEK else {}
    try:
        response = client.chat.completions.create(
            model=target.model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            **limits,
        )
    except openai.AuthenticationError as error:
        raise LlmError("the API key was rejected") from error
    except openai.RateLimitError as error:
        raise LlmError("the provider is rate limiting requests") from error
    except openai.APITimeoutError as error:
        raise LlmError("the provider took too long to answer") from error
    except openai.APIConnectionError as error:
        raise LlmError("the provider could not be reached") from error
    except openai.APIStatusError as error:
        raise LlmError(f"the provider returned an error ({error.status_code})") from error
    return response.choices[0].message.content or ""


def _complete_anthropic(target: LlmTarget, system: str, user: str) -> str:
    client = anthropic.Anthropic(
        api_key=target.api_key, timeout=target.timeout_seconds, max_retries=1
    )
    try:
        response = client.beta.messages.create(
            model=target.model,
            # Thinking shares this budget, so it is not sized to the answer alone.
            max_tokens=16000,
            # Summarising a handful of notes is routine work; low effort keeps
            # it quick and cheap.
            output_config={"effort": "low"},
            # If a safety classifier declines the request, let the API retry it
            # on the model Anthropic recommends before giving up.
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            system=system,
            messages=[{"role": "user", "content": user}],
        )
    except anthropic.AuthenticationError as error:
        raise LlmError("the API key was rejected") from error
    except anthropic.RateLimitError as error:
        raise LlmError("the provider is rate limiting requests") from error
    except anthropic.APITimeoutError as error:
        raise LlmError("the provider took too long to answer") from error
    except anthropic.APIConnectionError as error:
        raise LlmError("the provider could not be reached") from error
    except anthropic.APIStatusError as error:
        raise LlmError(f"the provider returned an error ({error.status_code})") from error

    if response.stop_reason == "refusal":
        raise LlmError("the model declined to summarise these notes")
    return "".join(block.text for block in response.content if block.type == "text")
