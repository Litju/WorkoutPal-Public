"""Hosted SCI-8 numerical adapter for Vercel's Python runtime."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import sys
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from typing import Any


def _load_engine() -> Any:
    bundled_path = Path(__file__).resolve().parent / "_scientific_signal_mechanics_processor.py"
    relative_engine = (
        Path("packages") / "science-port" / "engine" / "scientific_signal_mechanics_processor.py"
    )
    candidates = []
    for root in (
        bundled_path.parent,
        Path.cwd(),
        *Path.cwd().parents,
        *Path(__file__).resolve().parents,
    ):
        candidate = root / relative_engine
        if candidate not in candidates:
            candidates.append(candidate)
    if bundled_path.exists():
        digest_path = bundled_path.with_suffix(".py.sha256")
        if not digest_path.exists():
            raise RuntimeError("SCI-8 numerical engine digest was not bundled.")
        expected_digest = digest_path.read_text(encoding="utf-8").strip()
        actual_digest = hashlib.sha256(bundled_path.read_bytes()).hexdigest()
        if expected_digest != actual_digest:
            raise RuntimeError("SCI-8 numerical engine digest does not match the bundle.")
        engine_path: Path | None = bundled_path
    else:
        if os.environ.get("VERCEL") == "1":
            raise RuntimeError("SCI-8 numerical engine bundle is required on Vercel.")
        engine_path = next((candidate for candidate in candidates if candidate.exists()), None)
    if engine_path is None:
        raise RuntimeError("SCI-8 numerical engine was not bundled.")
    spec = importlib.util.spec_from_file_location(
        "workoutpal_sci8_signal_mechanics_processor", engine_path
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("SCI-8 numerical engine could not be loaded.")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


ENGINE = _load_engine()


def _json_response(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, allow_nan=False, separators=(",", ":")).encode("utf-8")


def _failure(code: str, message: str, **details: object) -> dict[str, Any]:
    return {
        "status": "FAILED",
        "failure": {
            "code": code,
            "message": message,
            "details": [{"key": key, "value": str(value)} for key, value in details.items()],
        },
    }


class handler(BaseHTTPRequestHandler):
    """Transport boundary; all SCI-8 arithmetic remains in the bundled engine."""

    def _write(self, payload: dict[str, Any], status: int = 200) -> None:
        body = _json_response(payload)
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:
        expected_revision = os.environ.get("VERCEL_GIT_COMMIT_SHA")
        received_revision = self.headers.get("x-workoutpal-science-source")
        if (
            expected_revision is None
            or received_revision is None
            or received_revision != expected_revision
        ):
            self._write(
                _failure(
                    "SCIENCE_ENGINE_UNAUTHORIZED",
                    "The hosted SCI-8 engine requires the exact deployment source SHA.",
                ),
                403,
            )
            return
        raw_body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
        try:
            payload = json.loads(raw_body.decode("utf-8"))
            result = ENGINE.process(payload)
        except ENGINE.EngineFailure as failure:
            result = {
                "status": "FAILED",
                "failure": {
                    "code": failure.code,
                    "message": failure.message,
                    "details": [
                        {"key": key, "value": str(value)}
                        for key, value in sorted(failure.details.items())
                    ],
                },
            }
        except (json.JSONDecodeError, TypeError, ValueError) as error:
            result = {
                "status": "INFRASTRUCTURE_FAILED",
                "exception": {
                    "code": "INFRASTRUCTURE_EXCEPTION",
                    "message": "The hosted SCI-8 engine could not decode its transport envelope.",
                    "details": [{"key": "error_type", "value": type(error).__name__}],
                },
            }
        except Exception as error:  # pragma: no cover - defensive runtime boundary
            result = {
                "status": "INFRASTRUCTURE_FAILED",
                "exception": {
                    "code": "INFRASTRUCTURE_EXCEPTION",
                    "message": (
                        "The hosted SCI-8 engine failed outside the scientific input contract."
                    ),
                    "details": [{"key": "error_type", "value": type(error).__name__}],
                },
            }
        self._write(result)

    def do_GET(self) -> None:
        self._write(_failure("METHOD_NOT_ALLOWED", "The SCI-8 engine accepts POST only."), 405)
