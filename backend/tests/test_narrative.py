"""Unit tests for choosing who writes a summary narrative, and for the fallback.

No test here touches the network or needs an API key: the provider call is
replaced with a fake.
"""

import uuid
from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

import anthropic
import openai
import pytest

from app import llm, narrative
from app.config import Settings
from app.llm import LlmError, LlmTarget, Provider
from app.models import Note, Patient
from app.narrative import (
    SYSTEM_PROMPT,
    GeneratorChoice,
    available_generators,
    build_prompt,
    narrate,
)

CHICAGO = ZoneInfo("America/Chicago")
PROVIDER_ENV = [
    "SUMMARY_PROVIDER",
    "DEEPSEEK_API_KEY",
    "DEEPSEEK_MODEL",
    "OPENAI_API_KEY",
    "OPENAI_MODEL",
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_MODEL",
]


@pytest.fixture(autouse=True)
def isolated(monkeypatch: pytest.MonkeyPatch):
    """Start every test with an empty cache and no provider settings from the shell."""
    for name in PROVIDER_ENV:
        monkeypatch.delenv(name, raising=False)
    narrative.clear_cache()


def settings(**overrides) -> Settings:
    # _env_file=None: ignore the developer's own .env, which may hold real keys.
    return Settings(_env_file=None, **overrides)


def make_patient() -> Patient:
    return Patient(
        id=uuid.uuid4(),
        first_name="Slim",
        last_name="Calhoun",
        date_of_birth=date(1958, 3, 14),
        email="slim.calhoun@example.com",
        phone="830-555-0101",
        address_line="412 Hill Country Rd",
        city="Luckenbach",
        state="TX",
        postal_code="78624",
        status="active",
        conditions=["Hypertension", "Type 2 diabetes"],
        medications=["Lisinopril 10 mg daily"],
        allergies=["Penicillin"],
    )


def make_notes(patient: Patient) -> list[Note]:
    return [
        # Deliberately newest first: the prompt must put them in date order.
        Note(
            patient_id=patient.id,
            content="BP 132/82. Continue current plan.",
            # 01:30 UTC on 26 September is still the 25th in Chicago.
            timestamp=datetime(2026, 9, 26, 1, 30, tzinfo=UTC),
            changes=[
                {
                    "field": "medications",
                    "action": "update",
                    "value": "Lisinopril 10 mg daily",
                    "new_value": "Lisinopril 20 mg daily",
                }
            ],
        ),
        Note(
            patient_id=patient.id,
            content="Annual physical. BP 148/92.",
            timestamp=datetime(2026, 3, 25, 15, 30, tzinfo=UTC),
        ),
    ]


class FakeProvider:
    """Stands in for llm.complete and records what it was asked."""

    def __init__(self, answer: str = "A narrative written by the model.", error: str | None = None):
        self.answer = answer
        self.error = error
        self.calls: list[tuple[LlmTarget, str, str]] = []

    def __call__(self, target: LlmTarget, system: str, user: str) -> str:
        self.calls.append((target, system, user))
        if self.error:
            raise LlmError(self.error)
        return self.answer


# --- which generator is used ---------------------------------------------------


def test_uses_the_template_when_no_provider_is_configured():
    patient = make_patient()
    provider = FakeProvider()

    result = narrate(patient, make_notes(patient), CHICAGO, settings(), completer=provider)

    assert result.generator == "template"
    assert result.model is None
    assert result.fallback_reason is None
    assert result.text.startswith("There are 2 clinical notes on file")
    assert provider.calls == []
    assert available_generators(settings()) == ["template"]


def test_auto_prefers_deepseek_then_openai_then_anthropic():
    patient = make_patient()
    notes = make_notes(patient)

    def chosen(**keys) -> str:
        provider = FakeProvider()
        narrate(patient, notes, CHICAGO, settings(**keys), completer=provider)
        return provider.calls[0][0].provider.value

    assert chosen(deepseek_api_key="d", openai_api_key="o", anthropic_api_key="a") == "deepseek"
    assert chosen(openai_api_key="o", anthropic_api_key="a") == "openai"
    assert chosen(anthropic_api_key="a") == "anthropic"


def test_uses_each_providers_configured_model_and_endpoint():
    config = settings(
        deepseek_api_key="d", openai_api_key="o", anthropic_api_key="a", openai_model="my-model"
    )
    targets = llm.configured_targets(config)

    assert targets[Provider.DEEPSEEK].model == "deepseek-flash"
    assert targets[Provider.DEEPSEEK].base_url == "https://api.deepseek.com"
    assert targets[Provider.OPENAI].model == "my-model"
    assert targets[Provider.OPENAI].base_url is None
    assert targets[Provider.ANTHROPIC].model == "claude-opus-5"


def test_an_empty_key_counts_as_not_configured():
    config = settings(deepseek_api_key="", openai_api_key="   ")

    assert llm.configured_targets(config) == {}
    assert available_generators(config) == ["template"]


def test_a_named_default_provider_is_used_and_listed_first():
    patient = make_patient()
    config = settings(summary_provider="anthropic", deepseek_api_key="d", anthropic_api_key="a")
    provider = FakeProvider()

    result = narrate(patient, make_notes(patient), CHICAGO, config, completer=provider)

    assert result.generator == "anthropic"
    assert result.model == "claude-opus-5"
    assert available_generators(config) == ["anthropic", "deepseek", "template"]


def test_a_request_can_choose_another_configured_provider_or_the_template():
    patient = make_patient()
    notes = make_notes(patient)
    config = settings(deepseek_api_key="d", openai_api_key="o")
    provider = FakeProvider()

    by_openai = narrate(patient, notes, CHICAGO, config, GeneratorChoice.OPENAI, completer=provider)
    by_template = narrate(
        patient, notes, CHICAGO, config, GeneratorChoice.TEMPLATE, completer=provider
    )

    assert by_openai.generator == "openai"
    assert by_template.generator == "template"
    assert by_template.fallback_reason is None
    assert len(provider.calls) == 1


def test_asking_for_a_provider_without_a_key_falls_back_and_says_why():
    patient = make_patient()
    provider = FakeProvider()

    result = narrate(
        patient,
        make_notes(patient),
        CHICAGO,
        settings(deepseek_api_key="d"),
        GeneratorChoice.OPENAI,
        completer=provider,
    )

    assert result.generator == "template"
    assert result.fallback_reason == "no API key is configured for OpenAI"
    assert provider.calls == []


def test_template_as_the_server_setting_turns_llms_off_for_every_request():
    patient = make_patient()
    config = settings(summary_provider="template", deepseek_api_key="d")
    provider = FakeProvider()

    default = narrate(patient, make_notes(patient), CHICAGO, config, completer=provider)
    asked = narrate(
        patient, make_notes(patient), CHICAGO, config, GeneratorChoice.DEEPSEEK, completer=provider
    )

    assert default.generator == "template" and default.fallback_reason is None
    assert asked.generator == "template"
    assert asked.fallback_reason == "AI summaries are turned off on this server"
    assert provider.calls == []
    assert available_generators(config) == ["template"]


# --- what is sent, and what comes back ---------------------------------------------


def test_returns_the_models_narrative_with_its_provider_and_model():
    patient = make_patient()
    provider = FakeProvider(answer="Slim's blood pressure has improved.")

    result = narrate(
        patient, make_notes(patient), CHICAGO, settings(deepseek_api_key="d"), completer=provider
    )

    assert result.text == "Slim's blood pressure has improved."
    assert (result.generator, result.model, result.fallback_reason) == (
        "deepseek",
        "deepseek-flash",
        None,
    )
    target, system, _ = provider.calls[0]
    assert system == SYSTEM_PROMPT
    assert target.api_key == "d"


def test_the_prompt_has_the_notes_in_date_order_with_clinic_dates_and_chart_changes():
    patient = make_patient()

    prompt = build_prompt(patient, make_notes(patient), CHICAGO)

    assert "Patient: Slim, " in prompt
    assert "Conditions: Hypertension and Type 2 diabetes." in prompt
    assert "Medications: Lisinopril 10 mg daily." in prompt
    assert "Allergies: Penicillin." in prompt
    first = prompt.index("[March 25, 2026] Annual physical. BP 148/92.")
    # The evening note is dated by the clinic's calendar, not UTC's.
    second = prompt.index("[September 25, 2026] BP 132/82. Continue current plan.")
    assert first < second
    assert (
        "(Chart updated: changed medication Lisinopril 10 mg daily to Lisinopril 20 mg daily.)"
        in prompt
    )


def test_the_prompt_leaves_out_identifying_details_the_narrative_does_not_need():
    patient = make_patient()

    prompt = build_prompt(patient, make_notes(patient), CHICAGO)

    for private in ["Calhoun", "1958", "slim.calhoun@example.com", "830-555-0101", "Hill Country"]:
        assert private not in prompt
    assert "Luckenbach" not in prompt and "78624" not in prompt


def test_a_patient_with_no_notes_is_never_sent_to_a_provider():
    patient = make_patient()
    provider = FakeProvider()

    result = narrate(patient, [], CHICAGO, settings(deepseek_api_key="d"), completer=provider)

    assert result.generator == "template"
    assert result.text == "No clinical notes have been recorded for Slim yet."
    assert result.fallback_reason is None
    assert provider.calls == []


def test_notes_too_long_to_send_fall_back_to_the_template():
    patient = make_patient()
    notes = [
        Note(
            patient_id=patient.id, content="x" * 5000, timestamp=datetime(2026, 1, day, tzinfo=UTC)
        )
        for day in range(1, 14)
    ]
    provider = FakeProvider()

    result = narrate(patient, notes, CHICAGO, settings(deepseek_api_key="d"), completer=provider)

    assert result.generator == "template"
    assert result.fallback_reason == "the notes are too long for an AI summary"
    assert provider.calls == []


# --- failure and caching ------------------------------------------------------------


def test_a_provider_failure_falls_back_to_the_template_with_the_reason():
    patient = make_patient()
    provider = FakeProvider(error="the provider took too long to answer")

    result = narrate(
        patient, make_notes(patient), CHICAGO, settings(deepseek_api_key="d"), completer=provider
    )

    assert result.generator == "template"
    assert result.model is None
    assert result.fallback_reason == "the provider took too long to answer"
    assert result.text.startswith("There are 2 clinical notes on file")


def test_a_failure_is_not_remembered_so_the_next_request_tries_again():
    patient = make_patient()
    notes = make_notes(patient)
    config = settings(deepseek_api_key="d")

    narrate(patient, notes, CHICAGO, config, completer=FakeProvider(error="boom"))
    recovered = FakeProvider(answer="Back in business.")
    result = narrate(patient, notes, CHICAGO, config, completer=recovered)

    assert result.text == "Back in business."
    assert len(recovered.calls) == 1


def test_an_unchanged_record_is_answered_from_the_cache():
    patient = make_patient()
    notes = make_notes(patient)
    config = settings(deepseek_api_key="d")
    provider = FakeProvider()

    first = narrate(patient, notes, CHICAGO, config, completer=provider)
    second = narrate(patient, notes, CHICAGO, config, completer=provider)

    assert first == second
    assert len(provider.calls) == 1


def test_refresh_asks_the_provider_again():
    patient = make_patient()
    notes = make_notes(patient)
    config = settings(deepseek_api_key="d")
    provider = FakeProvider()

    narrate(patient, notes, CHICAGO, config, completer=provider)
    narrate(patient, notes, CHICAGO, config, refresh=True, completer=provider)

    assert len(provider.calls) == 2


def test_a_new_note_or_a_different_provider_is_not_served_from_the_cache():
    patient = make_patient()
    notes = make_notes(patient)
    config = settings(deepseek_api_key="d", openai_api_key="o")
    provider = FakeProvider()

    narrate(patient, notes, CHICAGO, config, completer=provider)
    more_notes = [
        *notes,
        Note(
            patient_id=patient.id, content="Flu shot.", timestamp=datetime(2026, 9, 30, tzinfo=UTC)
        ),
    ]
    narrate(patient, more_notes, CHICAGO, config, completer=provider)
    narrate(patient, notes, CHICAGO, config, GeneratorChoice.OPENAI, completer=provider)

    assert len(provider.calls) == 3


# --- the provider adapters ----------------------------------------------------------


class RecordingClient:
    """A stand-in SDK client that records its constructor and request arguments."""

    def __init__(self, respond, **client_kwargs):
        self.client_kwargs = client_kwargs
        self.request_kwargs: dict = {}
        self._respond = respond
        # Both SDK call paths used by app.llm resolve to self.create.
        self.chat = self.beta = self
        self.completions = self.messages = self

    def create(self, **kwargs):
        self.request_kwargs = kwargs
        return self._respond()


def openai_reply(text: str):
    message = type("Message", (), {"content": text})
    choice = type("Choice", (), {"message": message})
    return type("Response", (), {"choices": [choice]})


def anthropic_reply(text: str, stop_reason: str = "end_turn"):
    thinking = type("Block", (), {"type": "thinking", "thinking": ""})
    block = type("Block", (), {"type": "text", "text": text})
    return type("Response", (), {"content": [thinking, block], "stop_reason": stop_reason})


def target(provider: Provider, **extra) -> LlmTarget:
    return LlmTarget(provider=provider, model="m", api_key="k", timeout_seconds=12, **extra)


def test_deepseek_is_called_through_the_openai_sdk_at_its_own_endpoint(monkeypatch):
    clients: list[RecordingClient] = []
    monkeypatch.setattr(
        openai,
        "OpenAI",
        lambda **kwargs: (
            clients.append(RecordingClient(lambda: openai_reply(" Hello. "), **kwargs))
            or clients[-1]
        ),
    )

    text = llm.complete(
        target(Provider.DEEPSEEK, base_url="https://api.deepseek.com"), "system", "user"
    )

    assert text == "Hello."
    assert clients[0].client_kwargs == {
        "api_key": "k",
        "base_url": "https://api.deepseek.com",
        "timeout": 12,
        "max_retries": 1,
    }
    assert clients[0].request_kwargs == {
        "model": "m",
        "messages": [
            {"role": "system", "content": "system"},
            {"role": "user", "content": "user"},
        ],
        "max_tokens": llm.NARRATIVE_MAX_TOKENS,
    }


def test_openai_uses_the_default_endpoint_and_no_legacy_token_limit(monkeypatch):
    clients: list[RecordingClient] = []
    monkeypatch.setattr(
        openai,
        "OpenAI",
        lambda **kwargs: (
            clients.append(RecordingClient(lambda: openai_reply("Hi."), **kwargs)) or clients[-1]
        ),
    )

    llm.complete(target(Provider.OPENAI), "system", "user")

    assert clients[0].client_kwargs["base_url"] is None
    assert "max_tokens" not in clients[0].request_kwargs


def test_anthropic_is_called_through_its_own_sdk(monkeypatch):
    clients: list[RecordingClient] = []
    monkeypatch.setattr(
        anthropic,
        "Anthropic",
        lambda **kwargs: (
            clients.append(RecordingClient(lambda: anthropic_reply("From Claude."), **kwargs))
            or clients[-1]
        ),
    )

    text = llm.complete(target(Provider.ANTHROPIC), "system", "user")

    # Only text blocks are used; the thinking block is ignored.
    assert text == "From Claude."
    assert clients[0].client_kwargs == {"api_key": "k", "timeout": 12, "max_retries": 1}
    request = clients[0].request_kwargs
    assert request["model"] == "m"
    assert request["system"] == "system"
    assert request["messages"] == [{"role": "user", "content": "user"}]
    assert request["fallbacks"] == "default"
    assert request["betas"] == ["server-side-fallback-2026-07-01"]
    assert request["output_config"] == {"effort": "low"}


def test_an_anthropic_refusal_is_reported_as_a_failure(monkeypatch):
    monkeypatch.setattr(
        anthropic,
        "Anthropic",
        lambda **kwargs: RecordingClient(lambda: anthropic_reply("", "refusal"), **kwargs),
    )

    with pytest.raises(LlmError, match="declined"):
        llm.complete(target(Provider.ANTHROPIC), "system", "user")


def test_an_empty_answer_is_a_failure(monkeypatch):
    monkeypatch.setattr(
        openai, "OpenAI", lambda **kwargs: RecordingClient(lambda: openai_reply("   "), **kwargs)
    )

    with pytest.raises(LlmError, match="empty"):
        llm.complete(target(Provider.OPENAI), "system", "user")


@pytest.mark.parametrize(
    ("sdk", "provider", "error", "reason"),
    [
        (openai, Provider.DEEPSEEK, "AuthenticationError", "the API key was rejected"),
        (openai, Provider.OPENAI, "RateLimitError", "rate limiting"),
        (openai, Provider.OPENAI, "APITimeoutError", "took too long"),
        (openai, Provider.DEEPSEEK, "APIConnectionError", "could not be reached"),
        (anthropic, Provider.ANTHROPIC, "AuthenticationError", "the API key was rejected"),
        (anthropic, Provider.ANTHROPIC, "RateLimitError", "rate limiting"),
        (anthropic, Provider.ANTHROPIC, "APITimeoutError", "took too long"),
        (anthropic, Provider.ANTHROPIC, "APIConnectionError", "could not be reached"),
    ],
)
def test_sdk_errors_become_short_reasons(monkeypatch, sdk, provider, error, reason):
    error_class = getattr(sdk, error)

    def fail():
        # Built without __init__: the SDK constructors want real HTTP objects.
        raise error_class.__new__(error_class)

    client_name = "Anthropic" if sdk is anthropic else "OpenAI"
    monkeypatch.setattr(sdk, client_name, lambda **kwargs: RecordingClient(fail, **kwargs))

    with pytest.raises(LlmError, match=reason):
        llm.complete(target(provider), "system", "user")
