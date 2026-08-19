"""SCI-2 position-to-linear-velocity numerical authority.

The process accepts one JSON request on stdin and emits one JSON response on
stdout. It intentionally uses only the Python standard library so the
finite-difference method remains transparent and reproducible.
"""

from __future__ import annotations

import json
import math
import sys
from typing import Any

PROCESSOR_ID = "resistance_training.linear_velocity_from_position"
PROCESSOR_VERSION = "1.0.0"
METHOD_ID = "finite_difference.second_order_uniform"
METHOD_VERSION = "1.0.0"


class EngineFailure(Exception):
    """A structured scientific failure caused by the supplied evidence."""

    def __init__(self, code: str, message: str, **details: object) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = [{"key": key, "value": str(value)} for key, value in details.items()]


def _finite(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise EngineFailure("NON_FINITE_SAMPLE", f"{label} must be a finite number.")
    number = float(value)
    if not math.isfinite(number):
        raise EngineFailure("NON_FINITE_SAMPLE", f"{label} must be a finite number.")
    return number


def _configuration(payload: dict[str, Any]) -> dict[str, float | int]:
    raw = payload.get("configuration", {})
    if not isinstance(raw, dict):
        raise EngineFailure("UNSUPPORTED_CONFIGURATION", "Configuration must be an object.")
    minimum_samples = raw.get("minimum_samples", 3)
    if (
        isinstance(minimum_samples, bool)
        or not isinstance(minimum_samples, int)
        or minimum_samples < 3
    ):
        raise EngineFailure(
            "UNSUPPORTED_CONFIGURATION",
            "minimum_samples must be an integer greater than or equal to 3.",
        )
    absolute_tolerance = _finite(
        raw.get("uniform_absolute_tolerance_seconds", 1e-12),
        "uniform_absolute_tolerance_seconds",
    )
    relative_tolerance = _finite(
        raw.get("uniform_relative_tolerance", 1e-9),
        "uniform_relative_tolerance",
    )
    if absolute_tolerance < 0 or relative_tolerance < 0:
        raise EngineFailure(
            "UNSUPPORTED_CONFIGURATION",
            "Uniform sampling tolerances must be non-negative.",
        )
    return {
        "minimum_samples": minimum_samples,
        "uniform_absolute_tolerance_seconds": absolute_tolerance,
        "uniform_relative_tolerance": relative_tolerance,
    }


def _samples(payload: dict[str, Any], minimum_samples: int) -> tuple[list[float], list[float]]:
    raw_samples = payload.get("samples")
    if not isinstance(raw_samples, list):
        raise EngineFailure("REQUIRED_EVIDENCE_MISSING", "samples must be provided as an array.")
    if len(raw_samples) < minimum_samples:
        raise EngineFailure(
            "INSUFFICIENT_SAMPLES",
            "At least the configured minimum number of samples is required.",
            minimum_samples=minimum_samples,
            received_samples=len(raw_samples),
        )

    times: list[float] = []
    positions: list[float] = []
    for index, raw_sample in enumerate(raw_samples):
        if (
            not isinstance(raw_sample, dict)
            or "sample_index" not in raw_sample
            or "time_s" not in raw_sample
            or "position_m" not in raw_sample
        ):
            raise EngineFailure(
                "MISSING_SAMPLE_UNSUPPORTED",
                "Every sample must contain a consecutive sample_index, time_s, and position_m.",
                sample_index=index,
            )
        sample_index = raw_sample["sample_index"]
        if (
            isinstance(sample_index, bool)
            or not isinstance(sample_index, int)
            or sample_index != index
        ):
            raise EngineFailure(
                "MISSING_SAMPLE_UNSUPPORTED",
                "Sample indexes must be consecutive and begin at zero; missing samples are unsupported.",
                sample_index=index,
            )
        times.append(_finite(raw_sample["time_s"], f"samples[{index}].time_s"))
        positions.append(_finite(raw_sample["position_m"], f"samples[{index}].position_m"))

    for index in range(1, len(times)):
        delta = times[index] - times[index - 1]
        if delta == 0:
            raise EngineFailure(
                "DUPLICATE_TIMESTAMP",
                "Timestamps must be strictly increasing; duplicate timestamps are unsupported.",
                sample_index=index,
            )
        if delta < 0:
            raise EngineFailure(
                "NON_MONOTONIC_TIME",
                "Timestamps must be strictly increasing.",
                sample_index=index,
            )
    return times, positions


def _declared_timebase(payload: dict[str, Any], received_sample_count: int) -> tuple[float, int]:
    raw_timebase = payload.get("timebase")
    if not isinstance(raw_timebase, dict):
        raise EngineFailure(
            "REQUIRED_EVIDENCE_MISSING",
            "A declared timebase with sample count and provenance is required.",
        )
    declared_step = _finite(
        raw_timebase.get("declared_time_step_s"), "timebase.declared_time_step_s"
    )
    declared_sample_count = raw_timebase.get("declared_sample_count")
    provenance_reference = raw_timebase.get("provenance_reference")
    if (
        isinstance(declared_sample_count, bool)
        or not isinstance(declared_sample_count, int)
        or declared_sample_count < 3
        or declared_sample_count != received_sample_count
    ):
        raise EngineFailure(
            "MISSING_SAMPLE_UNSUPPORTED",
            "The declared sample count must equal the complete consecutive sample series.",
            declared_sample_count=declared_sample_count,
            received_sample_count=received_sample_count,
        )
    if not isinstance(provenance_reference, str) or not provenance_reference.strip():
        raise EngineFailure(
            "REQUIRED_EVIDENCE_MISSING",
            "Timebase provenance is required.",
        )
    if declared_step <= 0:
        raise EngineFailure(
            "SAMPLING_INTERVAL_INVALID",
            "The declared sampling interval must be positive.",
        )
    return declared_step, declared_sample_count


def _validate_uniform_timebase(
    times: list[float],
    declared_step: float,
    absolute_tolerance: float,
    relative_tolerance: float,
) -> float:
    intervals = [times[index] - times[index - 1] for index in range(1, len(times))]
    if declared_step <= 0:
        raise EngineFailure("SAMPLING_INTERVAL_INVALID", "The sampling interval must be positive.")
    if absolute_tolerance >= declared_step:
        raise EngineFailure(
            "SAMPLING_INTERVAL_INVALID",
            "The absolute timebase tolerance must be smaller than the declared sampling interval.",
            declared_step=declared_step,
            absolute_tolerance=absolute_tolerance,
        )
    for index, interval in enumerate(intervals):
        if not math.isfinite(interval) or interval <= 0:
            raise EngineFailure(
                "SAMPLING_INTERVAL_INVALID",
                "The sampling interval must be positive.",
                interval_index=index,
            )
        tolerance = max(
            absolute_tolerance,
            relative_tolerance * max(abs(declared_step), abs(interval)),
        )
        if not math.isclose(interval, declared_step, rel_tol=0.0, abs_tol=tolerance):
            raise EngineFailure(
                "IRREGULAR_TIMEBASE_UNSUPPORTED",
                "SCI-2 v1 requires the observed timebase to match the declared uniform interval; irregular sampling is unsupported.",
                interval_index=index,
                expected_step=declared_step,
                received_step=interval,
                tolerance=tolerance,
            )
    return declared_step


def _differentiate(positions: list[float], step: float) -> list[float]:
    denominator = 2.0 * step
    if not math.isfinite(denominator):
        raise EngineFailure(
            "NUMERICAL_OVERFLOW",
            "The sampling interval produced a non-finite differentiation denominator.",
        )
    velocities = [0.0] * len(positions)
    velocities[0] = (-3.0 * positions[0] + 4.0 * positions[1] - positions[2]) / denominator
    for index in range(1, len(positions) - 1):
        velocities[index] = (positions[index + 1] - positions[index - 1]) / denominator
    last = len(positions) - 1
    velocities[last] = (
        3.0 * positions[last] - 4.0 * positions[last - 1] + positions[last - 2]
    ) / denominator
    for index, velocity in enumerate(velocities):
        if not math.isfinite(velocity):
            raise EngineFailure(
                "NUMERICAL_OVERFLOW",
                "Finite input samples produced a non-finite velocity output.",
                sample_index=index,
            )
    return velocities


def _interval_summaries(
    payload: dict[str, Any], times: list[float], positions: list[float], velocities: list[float]
) -> list[dict[str, Any]]:
    raw_intervals = payload.get("intervals", [])
    if raw_intervals is None:
        return []
    if not isinstance(raw_intervals, list):
        raise EngineFailure(
            "UNSUPPORTED_CONFIGURATION", "intervals must be an array when provided."
        )
    summaries: list[dict[str, Any]] = []
    for interval_index, raw_interval in enumerate(raw_intervals):
        if not isinstance(raw_interval, dict):
            raise EngineFailure(
                "METHOD_NOT_APPLICABLE",
                "An interval must be an explicit object with sample indexes and qualification reference.",
                interval_index=interval_index,
            )
        interval_id = raw_interval.get("id")
        qualification_reference = raw_interval.get("qualification_reference")
        start_index = raw_interval.get("start_index")
        end_index = raw_interval.get("end_index")
        if not isinstance(interval_id, str) or not interval_id.strip():
            raise EngineFailure(
                "METHOD_NOT_APPLICABLE",
                "An explicit interval requires a non-empty id.",
                interval_index=interval_index,
            )
        if not isinstance(qualification_reference, str) or not qualification_reference.strip():
            raise EngineFailure(
                "METHOD_NOT_APPLICABLE",
                "An explicit interval requires a qualification reference.",
                interval_id=interval_id,
            )
        if (
            isinstance(start_index, bool)
            or not isinstance(start_index, int)
            or isinstance(end_index, bool)
            or not isinstance(end_index, int)
            or start_index < 0
            or end_index >= len(times)
            or end_index <= start_index
        ):
            raise EngineFailure(
                "METHOD_NOT_APPLICABLE",
                "An interval must select at least two ordered samples within the series.",
                interval_id=interval_id,
            )
        duration = times[end_index] - times[start_index]
        if duration <= 0:
            raise EngineFailure(
                "METHOD_NOT_APPLICABLE",
                "An interval duration must be positive.",
                interval_id=interval_id,
            )
        interval_average = (positions[end_index] - positions[start_index]) / duration
        peak_sampled = max(velocities[start_index : end_index + 1])
        if not math.isfinite(interval_average) or not math.isfinite(peak_sampled):
            raise EngineFailure(
                "NUMERICAL_OVERFLOW",
                "Finite input samples produced a non-finite interval summary.",
                interval_id=interval_id,
            )
        summaries.append(
            {
                "id": interval_id,
                "qualification_reference": qualification_reference,
                "start_index": start_index,
                "end_index": end_index,
                "interval_average_velocity_mps": interval_average,
                "peak_sampled_velocity_mps": peak_sampled,
            }
        )
    return summaries


def process(payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise EngineFailure("REQUIRED_EVIDENCE_MISSING", "The processor request must be an object.")
    config = _configuration(payload)
    times, positions = _samples(payload, int(config["minimum_samples"]))
    declared_step, declared_sample_count = _declared_timebase(payload, len(times))
    step = _validate_uniform_timebase(
        times,
        declared_step,
        float(config["uniform_absolute_tolerance_seconds"]),
        float(config["uniform_relative_tolerance"]),
    )
    velocities = _differentiate(positions, step)
    return {
        "status": "SUCCEEDED",
        "processor": {"id": PROCESSOR_ID, "version": PROCESSOR_VERSION},
        "method": {"id": METHOD_ID, "version": METHOD_VERSION},
        "time_step_s": step,
        "timebase": {
            "declared_step_s": declared_step,
            "declared_sample_count": declared_sample_count,
        },
        "velocity_samples": [
            {"time_s": time, "velocity_mps": velocity} for time, velocity in zip(times, velocities)
        ],
        "interval_summaries": _interval_summaries(payload, times, positions, velocities),
    }


def main() -> int:
    try:
        raw = sys.stdin.read()
        request = json.loads(raw)
        response = process(request)
    except EngineFailure as failure:
        response = {
            "status": "FAILED",
            "failure": {
                "code": failure.code,
                "message": failure.message,
                "details": failure.details,
            },
        }
    except (json.JSONDecodeError, TypeError, ValueError) as error:
        response = {
            "status": "INFRASTRUCTURE_FAILED",
            "exception": {
                "code": "INFRASTRUCTURE_EXCEPTION",
                "message": "The Python engine could not decode or process its transport envelope.",
                "details": [{"key": "error_type", "value": type(error).__name__}],
            },
        }
    except Exception as error:  # pragma: no cover - defensive process boundary
        response = {
            "status": "INFRASTRUCTURE_FAILED",
            "exception": {
                "code": "INFRASTRUCTURE_EXCEPTION",
                "message": "The Python engine failed outside the scientific input contract.",
                "details": [{"key": "error_type", "value": type(error).__name__}],
            },
        }
    sys.stdout.write(json.dumps(response, allow_nan=False, separators=(",", ":")))
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
