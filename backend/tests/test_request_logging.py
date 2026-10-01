"""Unit tests for the request logging middleware.

They run against a small throwaway app, so they need no database.
"""

import logging
import re

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.log import request_id_var
from app.main import unhandled_error
from app.middleware import REQUEST_ID_HEADER, RequestLoggingMiddleware

HEX_ID = re.compile(r"[0-9a-f]{32}")
ACCESS_LINE = re.compile(
    r"method=(?P<method>\S+) path=(?P<path>\S+) status=(?P<status>\d+) "
    r"duration_ms=(?P<duration_ms>\d+\.\d) client=(?P<client>\S+)"
)

app_logger = logging.getLogger("tests.endpoint")


def build_app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(RequestLoggingMiddleware)
    app.add_exception_handler(Exception, unhandled_error)

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/patients")
    def patients() -> list[str]:
        # A sync endpoint runs in a worker thread, like the real ones.
        app_logger.info("looking up patients, request id %s", request_id_var.get())
        return []

    @app.post("/patients", status_code=201)
    def create() -> dict[str, str]:
        return {"id": "1"}

    @app.get("/boom")
    def boom() -> None:
        raise RuntimeError("kaboom")

    return app


@pytest.fixture
def client() -> TestClient:
    return TestClient(build_app(), raise_server_exceptions=False)


@pytest.fixture
def access_log(caplog: pytest.LogCaptureFixture) -> pytest.LogCaptureFixture:
    # set_level also sets the capture handler's level, so the last call must
    # be the most verbose one.
    caplog.set_level(logging.INFO, logger="tests.endpoint")
    caplog.set_level(logging.DEBUG, logger="app.access")
    return caplog


def access_records(caplog: pytest.LogCaptureFixture) -> list[logging.LogRecord]:
    return [record for record in caplog.records if record.name == "app.access"]


def test_logs_one_line_per_request(client: TestClient, access_log: pytest.LogCaptureFixture):
    response = client.post("/patients")

    assert response.status_code == 201
    [record] = access_records(access_log)
    assert record.levelno == logging.INFO
    line = ACCESS_LINE.fullmatch(record.getMessage())
    assert line is not None, record.getMessage()
    assert line["method"] == "POST"
    assert line["path"] == "/patients"
    assert line["status"] == "201"
    assert float(line["duration_ms"]) >= 0
    assert line["client"] == "testclient"


def test_leaves_the_query_string_out_of_the_log(
    client: TestClient, access_log: pytest.LogCaptureFixture
):
    client.get("/patients?q=slim+calhoun&status=critical")

    [record] = access_records(access_log)
    assert "path=/patients " in record.getMessage()
    assert "slim" not in record.getMessage()
    assert "?" not in record.getMessage()


def test_generates_a_request_id_and_returns_it(client: TestClient):
    first = client.get("/patients")
    second = client.get("/patients")

    assert HEX_ID.fullmatch(first.headers[REQUEST_ID_HEADER])
    assert HEX_ID.fullmatch(second.headers[REQUEST_ID_HEADER])
    assert first.headers[REQUEST_ID_HEADER] != second.headers[REQUEST_ID_HEADER]


def test_keeps_a_sensible_inbound_request_id(client: TestClient):
    response = client.get("/patients", headers={REQUEST_ID_HEADER: "proxy-abc_123.4"})

    assert response.headers[REQUEST_ID_HEADER] == "proxy-abc_123.4"


@pytest.mark.parametrize(
    "unsafe",
    ["has spaces", "x" * 65, "semi;colon", "", "new\tline"],
    ids=["spaces", "too long", "punctuation", "empty", "control character"],
)
def test_replaces_an_unsafe_inbound_request_id(client: TestClient, unsafe: str):
    response = client.get("/patients", headers={REQUEST_ID_HEADER: unsafe})

    assert HEX_ID.fullmatch(response.headers[REQUEST_ID_HEADER])


def test_stamps_the_request_id_on_logs_written_during_the_request(
    client: TestClient, access_log: pytest.LogCaptureFixture
):
    response = client.get("/patients", headers={REQUEST_ID_HEADER: "trace-me"})

    assert response.status_code == 200
    [endpoint_record] = [r for r in access_log.records if r.name == "tests.endpoint"]
    assert endpoint_record.getMessage() == "looking up patients, request id trace-me"
    # Outside a request there is no id.
    assert request_id_var.get() == "-"


def test_logs_client_errors_at_info(client: TestClient, access_log: pytest.LogCaptureFixture):
    response = client.get("/no-such-route")

    assert response.status_code == 404
    [record] = access_records(access_log)
    assert record.levelno == logging.INFO
    assert "path=/no-such-route status=404" in record.getMessage()


def test_logs_health_checks_at_debug(client: TestClient, access_log: pytest.LogCaptureFixture):
    client.get("/health")

    [record] = access_records(access_log)
    assert record.levelno == logging.DEBUG


def test_logs_an_unhandled_error_as_500_and_still_returns_the_request_id(
    client: TestClient, access_log: pytest.LogCaptureFixture
):
    response = client.get("/boom", headers={REQUEST_ID_HEADER: "trace-me"})

    assert response.status_code == 500
    assert response.json() == {"detail": "Internal server error"}
    assert response.headers[REQUEST_ID_HEADER] == "trace-me"
    [record] = access_records(access_log)
    assert record.levelno == logging.ERROR
    assert "method=GET path=/boom status=500" in record.getMessage()
    # The traceback is logged once, by the error handler.
    [error_record] = [r for r in access_log.records if r.name == "app.main"]
    assert error_record.exc_info is not None
    assert "kaboom" in str(error_record.exc_info[1])
