"""Hosted SCI-2 adapter for Vercel's Python runtime.

The numerical implementation remains the shared standard-library engine under
packages/science-port/engine. This file is only a minimal HTTP runtime adapter
for deployments whose Node.js runtime cannot spawn Python directly.
"""

from __future__ import annotations

import importlib.util
import json
import os
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from typing import Any


def _load_engine() -> Any:
    bundled_path = Path(__file__).resolve().parent / "_velocity_processor.py"
    relative_engine = Path("packages") / "science-port" / "engine" / "velocity_processor.py"
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
    engine_path = (
        bundled_path
        if bundled_path.exists()
        else next((candidate for candidate in candidates if candidate.exists()), None)
    )
    if engine_path is None:
        raise RuntimeError("SCI-2 numerical engine was not bundled.")
    spec = importlib.util.spec_from_file_location("workoutpal_sci2_velocity_processor", engine_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("SCI-2 numerical engine could not be loaded.")
    module = importlib.util.module_from_spec(spec)
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
    """Vercel Python runtime entrypoint for the SCI-2 engine payload."""

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
                    "The hosted SCI-2 engine requires the exact deployment source SHA.",
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
                    "details": failure.details,
                },
            }
        except (json.JSONDecodeError, TypeError, ValueError) as error:
            result = {
                "status": "INFRASTRUCTURE_FAILED",
                "exception": {
                    "code": "INFRASTRUCTURE_EXCEPTION",
                    "message": "The hosted SCI-2 engine could not decode its transport envelope.",
                    "details": [{"key": "error_type", "value": type(error).__name__}],
                },
            }
        except Exception as error:  # pragma: no cover - defensive runtime boundary
            result = {
                "status": "INFRASTRUCTURE_FAILED",
                "exception": {
                    "code": "INFRASTRUCTURE_EXCEPTION",
                    "message": "The hosted SCI-2 engine failed outside the scientific input contract.",
                    "details": [{"key": "error_type", "value": type(error).__name__}],
                },
            }
        self._write(result)

    def do_GET(self) -> None:
        self._write(
            _failure("METHOD_NOT_ALLOWED", "The SCI-2 engine accepts POST only."),
            405,
        )
