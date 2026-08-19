"""SCI-7 numerical authority for inverse load--velocity calculations.

The transport envelope is intentionally small.  Binding, claim construction,
and qualification remain in the TypeScript SciencePort adapter; this module
owns the arithmetic and the numerical guards so that the inverse equation is
implemented in one place.
"""

from __future__ import annotations

import json
import math
import sys
from typing import Any

PROCESSOR_ID = "resistance_training.maximal_strength_modeling"
PROCESSOR_VERSION = "1.0.0"
TARGET_LOAD_METHOD_ID = "load_velocity.inverse_linear_target_velocity"
ESTIMATED_ONE_REP_MAXIMUM_METHOD_ID = "maximal_strength.estimated_one_rep_maximum"
METHOD_VERSION = "1.0.0"


class EngineFailure(Exception):
    """A structured, scientifically meaningful input or method failure."""

    def __init__(self, code: str, message: str, **details: object) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details


def _record(value: object, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise EngineFailure("INPUT_INVALID", f"{label} must be an object.")
    return value


def _finite(value: object, label: str, code: str = "INPUT_INVALID") -> float:
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        raise EngineFailure(code, f"{label} must be finite.")
    number = float(value)
    if not math.isfinite(number):
        raise EngineFailure(code, f"{label} must be finite.")
    return number


def _text(value: object, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise EngineFailure("INPUT_INVALID", f"{label} is required.")
    return value.strip()


def _model(payload: dict[str, Any]) -> dict[str, Any]:
    model = _record(payload.get("model"), "model")
    profile_id = _text(model.get("profile_id"), "model.profile_id")
    slope = _finite(model.get("slope_mps_per_kg"), "model.slope_mps_per_kg", "SLOPE_NONFINITE")
    intercept = _finite(model.get("intercept_mps"), "model.intercept_mps", "SLOPE_NONFINITE")
    domain = _record(model.get("observed_domain"), "model.observed_domain")
    minimum_load = _finite(domain.get("external_load_min_kg"), "observed minimum load")
    maximum_load = _finite(domain.get("external_load_max_kg"), "observed maximum load")
    minimum_velocity = _finite(
        domain.get("directional_velocity_min_mps"), "observed minimum velocity"
    )
    maximum_velocity = _finite(
        domain.get("directional_velocity_max_mps"), "observed maximum velocity"
    )
    if minimum_load >= maximum_load:
        raise EngineFailure("INPUT_INVALID", "Observed load domain must have positive span.")
    if minimum_velocity <= 0 or maximum_velocity <= 0 or minimum_velocity > maximum_velocity:
        raise EngineFailure("INPUT_INVALID", "Observed velocity domain is invalid.")
    return {
        "profile_id": profile_id,
        "slope": slope,
        "intercept": intercept,
        "minimum_load": minimum_load,
        "maximum_load": maximum_load,
        "minimum_velocity": minimum_velocity,
        "maximum_velocity": maximum_velocity,
        "fit_method": model.get("fit_method"),
        "number_of_observations": model.get("number_of_observations"),
    }


def _domain_classification(
    estimated_load: float, minimum_load: float, maximum_load: float
) -> tuple[str, float, float, float]:
    span = maximum_load - minimum_load
    if estimated_load > maximum_load:
        distance = estimated_load - maximum_load
        return (
            "EXTRAPOLATED_ABOVE_OBSERVED_LOAD_DOMAIN",
            distance,
            0.0,
            distance / span,
        )
    if estimated_load < minimum_load:
        distance = minimum_load - estimated_load
        return (
            "EXTRAPOLATED_BELOW_OBSERVED_LOAD_DOMAIN",
            0.0,
            distance,
            distance / span,
        )
    return ("WITHIN_OBSERVED_LOAD_DOMAIN", 0.0, 0.0, 0.0)


def _velocity_domain_classification(
    target_velocity: float, minimum_velocity: float, maximum_velocity: float
) -> str:
    if target_velocity > maximum_velocity:
        return "EXTRAPOLATED_ABOVE_OBSERVED_VELOCITY_DOMAIN"
    if target_velocity < minimum_velocity:
        return "EXTRAPOLATED_BELOW_OBSERVED_VELOCITY_DOMAIN"
    return "WITHIN_OBSERVED_VELOCITY_DOMAIN"


def process(payload: dict[str, Any]) -> dict[str, Any]:
    envelope = _record(payload, "SCI-7 payload")
    processor = _record(envelope.get("processor"), "processor")
    if processor.get("id") != PROCESSOR_ID or processor.get("version") != PROCESSOR_VERSION:
        raise EngineFailure("UNSUPPORTED_CONFIGURATION", "Unsupported SCI-7 processor identity.")

    operation = _text(envelope.get("operation"), "operation")
    if operation not in {"TARGET_LOAD", "ESTIMATED_1RM"}:
        raise EngineFailure("UNSUPPORTED_CONFIGURATION", "Unsupported SCI-7 operation.")
    method_id = (
        TARGET_LOAD_METHOD_ID if operation == "TARGET_LOAD" else ESTIMATED_ONE_REP_MAXIMUM_METHOD_ID
    )
    model = _model(envelope)
    target_velocity = _finite(envelope.get("target_velocity_mps"), "target velocity")
    if target_velocity <= 0:
        raise EngineFailure(
            "TARGET_VELOCITY_INVALID",
            "Target velocity must be positive; zero is not an MVT or velocity-at-1RM target.",
        )

    slope = model["slope"]
    intercept = model["intercept"]
    if slope == 0:
        raise EngineFailure("SLOPE_ZERO", "Inverse load calculation is undefined for a zero slope.")
    if operation == "ESTIMATED_1RM" and slope >= 0:
        raise EngineFailure(
            "EXPECTED_INVERSE_RELATIONSHIP_NOT_OBSERVED",
            "Maximal-strength inference requires a strictly negative load--velocity slope.",
        )

    estimated_load = (target_velocity - intercept) / slope
    if not math.isfinite(estimated_load):
        raise EngineFailure("ESTIMATED_LOAD_NONFINITE", "Inverse load estimate is non-finite.")
    if estimated_load <= 0:
        raise EngineFailure(
            "ESTIMATED_LOAD_NON_POSITIVE",
            "Inverse load estimate must be a positive external mass.",
        )

    classification, above_distance, below_distance, ratio = _domain_classification(
        estimated_load, model["minimum_load"], model["maximum_load"]
    )
    sensitivity = {
        "d_load_d_target_velocity": 1.0 / slope,
        "d_load_d_intercept": -1.0 / slope,
        "d_load_d_slope": -(target_velocity - intercept) / (slope * slope),
    }
    if not all(math.isfinite(value) for value in sensitivity.values()):
        raise EngineFailure("NUMERICAL_OVERFLOW", "Inverse sensitivity is non-finite.")

    method = {"id": method_id, "version": METHOD_VERSION}
    return {
        "status": "SUCCEEDED",
        "processor": {"id": PROCESSOR_ID, "version": PROCESSOR_VERSION},
        "method": method,
        "operation": operation,
        "profile_id": model["profile_id"],
        "target_velocity_mps": target_velocity,
        "estimated_load_kg": estimated_load,
        "domain_classification": classification,
        "extrapolation": {
            "max_observed_load_kg": model["maximum_load"],
            "min_observed_load_kg": model["minimum_load"],
            "estimated_load_kg": estimated_load,
            "load_extrapolation_distance_above_kg": above_distance,
            "load_extrapolation_distance_below_kg": below_distance,
            "observed_load_span_kg": model["maximum_load"] - model["minimum_load"],
            "extrapolation_distance_to_span_ratio": ratio,
            "velocity_domain_classification": _velocity_domain_classification(
                target_velocity, model["minimum_velocity"], model["maximum_velocity"]
            ),
            "min_observed_velocity_mps": model["minimum_velocity"],
            "max_observed_velocity_mps": model["maximum_velocity"],
        },
        "sensitivity": sensitivity,
        "diagnostics": {
            "slope_mps_per_kg": slope,
            "intercept_mps": intercept,
            "fit_method": model["fit_method"],
            "number_of_observations": model["number_of_observations"],
            "negative_slope_required_for_maximal_inference": operation == "ESTIMATED_1RM",
        },
        "uncertainty": {
            "kind": "UNKNOWN",
            "reason": (
                "No complete covariance or validated empirical inverse-model uncertainty "
                "propagation is available."
            ),
            "source": {"kind": "METHOD", "method": method},
        },
    }


def _main() -> None:
    try:
        payload = json.load(sys.stdin)
        result = process(payload)
    except EngineFailure as failure:
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
                "message": "The SCI-7 engine could not decode its transport envelope.",
                "details": [{"key": "error_type", "value": type(error).__name__}],
            },
        }
    except Exception as error:  # pragma: no cover - defensive process boundary
        result = {
            "status": "INFRASTRUCTURE_FAILED",
            "exception": {
                "code": "INFRASTRUCTURE_EXCEPTION",
                "message": "The SCI-7 engine failed outside the scientific input contract.",
                "details": [{"key": "error_type", "value": type(error).__name__}],
            },
        }
    print(json.dumps(result, allow_nan=False, separators=(",", ":")))


if __name__ == "__main__":
    _main()
