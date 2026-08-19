"""SCI-4 rep/phase kinematic metric numerical authority.

This module intentionally accepts already-qualified SCI-2 samples and SCI-3
sample-aligned intervals. It does not detect repetitions, alter boundaries, or
recompute the SCI-2 interval-average algorithm.
"""

from __future__ import annotations

import json
import math
import sys
from typing import Any, NoReturn

PROCESSOR_ID = "resistance_training.rep_phase_kinematic_metrics"
PROCESSOR_VERSION = "1.0.0"
METHOD_ID = "rep_phase_metrics.sample_aligned_claim_binding"
METHOD_VERSION = "1.0.0"

METRIC_UNITS = {
    "PHASE_DURATION": ("s", "time"),
    "PHASE_SIGNED_DISPLACEMENT": ("m", "length"),
    "PHASE_INTERVAL_AVERAGE_SIGNED_LINEAR_VELOCITY": ("m/s", "speed"),
    "PHASE_DIRECTION_PEAK_SAMPLED_LINEAR_VELOCITY": ("m/s", "speed"),
    "REP_TOTAL_DURATION": ("s", "time"),
}
PHASE_METRICS = set(METRIC_UNITS) - {"REP_TOTAL_DURATION"}


class EngineFailure(Exception):
    """A deterministic, user-actionable numerical validation failure."""

    def __init__(self, code: str, message: str, **details: object) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details


def _fail(code: str, message: str, **details: object) -> NoReturn:
    raise EngineFailure(code, message, **details)


def _record(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        _fail("INPUT_INVALID", f"{label} must be an object.")
    return value


def _text(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        _fail("INPUT_INVALID", f"{label} must be non-empty text.")
    return value.strip()


def _finite(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        _fail("NON_FINITE_SAMPLE", f"{label} must be numeric.")
    result = float(value)
    if not math.isfinite(result):
        _fail("NON_FINITE_SAMPLE", f"{label} must be finite.")
    return result


def _integer(value: Any, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        _fail("INPUT_INVALID", f"{label} must be an integer.")
    return value


def _close(left: float, right: float, absolute: float, relative: float) -> bool:
    return abs(left - right) <= max(absolute, relative * max(abs(left), abs(right), 1.0))


def _validate_samples(payload: dict[str, Any]) -> tuple[list[dict[str, float | int]], float]:
    raw_samples = payload.get("samples")
    if not isinstance(raw_samples, list) or len(raw_samples) < 2:
        _fail("INSUFFICIENT_SAMPLES", "SCI-4 requires at least two aligned samples.")
    timebase = _record(payload.get("timebase"), "timebase")
    declared_count = _integer(
        timebase.get("declared_sample_count"), "timebase.declared_sample_count"
    )
    if declared_count != len(raw_samples):
        _fail(
            "MISSING_SAMPLE_UNSUPPORTED", "The declared sample count must equal the sample count."
        )
    declared_step = _finite(timebase.get("declared_step_s"), "timebase.declared_step_s")
    if declared_step <= 0:
        _fail("SAMPLING_INTERVAL_INVALID", "The declared sampling interval must be positive.")
    configuration = _record(payload.get("configuration"), "configuration")
    absolute = _finite(
        configuration.get("uniform_absolute_tolerance_s", 1e-12),
        "configuration.uniform_absolute_tolerance_s",
    )
    relative = _finite(
        configuration.get("uniform_relative_tolerance", 1e-9),
        "configuration.uniform_relative_tolerance",
    )
    samples: list[dict[str, float | int]] = []
    previous_time: float | None = None
    for expected_index, raw_sample in enumerate(raw_samples):
        sample = _record(raw_sample, f"samples[{expected_index}]")
        sample_index = _integer(
            sample.get("sample_index"), f"samples[{expected_index}].sample_index"
        )
        if sample_index != expected_index:
            _fail(
                "MISSING_SAMPLE_UNSUPPORTED",
                "Sample indexes must be consecutive and aligned.",
                sample_index=expected_index,
            )
        time_s = _finite(sample.get("time_s"), f"samples[{expected_index}].time_s")
        position_m = _finite(sample.get("position_m"), f"samples[{expected_index}].position_m")
        velocity_mps = _finite(
            sample.get("velocity_mps"), f"samples[{expected_index}].velocity_mps"
        )
        if previous_time is not None:
            step = time_s - previous_time
            if step == 0:
                _fail(
                    "DUPLICATE_TIMESTAMP",
                    "Sample timestamps must be strictly increasing.",
                    sample_index=expected_index,
                )
            if step < 0:
                _fail(
                    "NON_MONOTONIC_TIME",
                    "Sample timestamps must be strictly increasing.",
                    sample_index=expected_index,
                )
            if not _close(step, declared_step, absolute, relative):
                _fail(
                    "IRREGULAR_TIMEBASE_UNSUPPORTED",
                    "SCI-4 requires the inherited uniform sample timebase.",
                    sample_index=expected_index,
                )
        samples.append(
            {
                "sample_index": sample_index,
                "time_s": time_s,
                "position_m": position_m,
                "velocity_mps": velocity_mps,
            }
        )
        previous_time = time_s
    return samples, declared_step


def _validate_interval(
    interval: dict[str, Any],
    label: str,
    sample_count: int,
    phase: bool,
) -> tuple[int, int, list[str]]:
    start_index = _integer(interval.get("start_index"), f"{label}.start_index")
    end_index = _integer(interval.get("end_index"), f"{label}.end_index")
    if start_index < 0 or end_index >= sample_count or end_index <= start_index:
        _fail("INTERVAL_INVALID", f"{label} must be an ordered in-range sampled interval.")
    requested = interval.get("requested_metric_ids")
    if not isinstance(requested, list) or not requested:
        _fail("REQUIRED_EVIDENCE_MISSING", f"{label}.requested_metric_ids is required.")
    normalized: list[str] = []
    for metric_id in requested:
        metric = _text(metric_id, f"{label}.requested_metric_ids")
        if (
            metric not in METRIC_UNITS
            or (phase and metric == "REP_TOTAL_DURATION")
            or (not phase and metric != "REP_TOTAL_DURATION")
        ):
            _fail(
                "UNSUPPORTED_CONFIGURATION",
                f"{label} contains an unsupported metric id.",
                metric_id=metric,
            )
        if metric in normalized:
            _fail(
                "UNSUPPORTED_CONFIGURATION",
                f"{label} contains a duplicate metric id.",
                metric_id=metric,
            )
        normalized.append(metric)
    if phase:
        polarity = _text(interval.get("polarity"), f"{label}.polarity")
        if polarity not in {"POSITIVE", "NEGATIVE"}:
            _fail("PROTOCOL_INCOMPATIBLE", f"{label}.polarity must be POSITIVE or NEGATIVE.")
        _text(interval.get("phase_id"), f"{label}.phase_id")
        _text(interval.get("interval_authority"), f"{label}.interval_authority")
        _text(interval.get("qualification_reference"), f"{label}.qualification_reference")
    return start_index, end_index, normalized


def _summary_map(
    payload: dict[str, Any], samples: list[dict[str, float | int]]
) -> list[dict[str, Any]]:
    raw_summaries = payload.get("sci2_interval_summaries")
    if not isinstance(raw_summaries, list):
        _fail("REQUIRED_EVIDENCE_MISSING", "SCI-2 interval summaries are required.")
    summaries: list[dict[str, Any]] = []
    for index, raw_summary in enumerate(raw_summaries):
        summary = _record(raw_summary, f"sci2_interval_summaries[{index}]")
        summary_id = _text(summary.get("id"), f"sci2_interval_summaries[{index}].id")
        claim_id = _text(
            summary.get("velocity_claim_id"), f"sci2_interval_summaries[{index}].velocity_claim_id"
        )
        qualification_reference = _text(
            summary.get("qualification_reference"),
            f"sci2_interval_summaries[{index}].qualification_reference",
        )
        start_index = _integer(
            summary.get("start_index"), f"sci2_interval_summaries[{index}].start_index"
        )
        end_index = _integer(
            summary.get("end_index"), f"sci2_interval_summaries[{index}].end_index"
        )
        if start_index < 0 or end_index >= len(samples) or end_index <= start_index:
            _fail(
                "INTERVAL_INVALID",
                "SCI-2 interval summary indexes must bind an ordered sampled interval.",
                summary_id=summary_id,
            )
        average = _finite(
            summary.get("interval_average_velocity_mps"),
            f"sci2_interval_summaries[{index}].interval_average_velocity_mps",
        )
        summaries.append(
            {
                "id": summary_id,
                "velocity_claim_id": claim_id,
                "qualification_reference": qualification_reference,
                "start_index": start_index,
                "end_index": end_index,
                "interval_average_velocity_mps": average,
            }
        )
    return summaries


def _find_summary(
    summaries: list[dict[str, Any]],
    start_index: int,
    end_index: int,
    claim_id: str,
    qualification_reference: str,
) -> dict[str, Any]:
    matches = [
        summary
        for summary in summaries
        if summary["start_index"] == start_index
        and summary["end_index"] == end_index
        and summary["velocity_claim_id"] == claim_id
        and summary["qualification_reference"] == qualification_reference
    ]
    if len(matches) != 1:
        _fail(
            "SCI2_INTERVAL_MISMATCH",
            "Exactly one SCI-2 interval summary must bind the SCI-3 phase interval.",
            start_index=start_index,
            end_index=end_index,
        )
    return matches[0]


def _directional_peak(
    samples: list[dict[str, float | int]], start_index: int, end_index: int, polarity: str
) -> tuple[float, int]:
    candidate_index = start_index
    candidate_value = float(samples[start_index]["velocity_mps"])
    for index in range(start_index + 1, end_index + 1):
        value = float(samples[index]["velocity_mps"])
        if (polarity == "POSITIVE" and value > candidate_value) or (
            polarity == "NEGATIVE" and value < candidate_value
        ):
            candidate_index = index
            candidate_value = value
    return candidate_value, candidate_index


def _metric(
    metric_id: str, value: float, selected_sample: int | None, samples: list[dict[str, float | int]]
) -> dict[str, Any]:
    unit, dimension = METRIC_UNITS[metric_id]
    result: dict[str, Any] = {
        "metric_id": metric_id,
        "metric_version": "1.0.0",
        "value": value,
        "unit": unit,
        "dimension": dimension,
    }
    if selected_sample is not None:
        result["selected_sample_index"] = selected_sample
        result["selected_sample_time_s"] = float(samples[selected_sample]["time_s"])
    return result


def process(payload: dict[str, Any]) -> dict[str, Any]:
    samples, step = _validate_samples(payload)
    summaries = _summary_map(payload, samples)
    claim_id = _text(payload.get("sci2_claim_id"), "sci2_claim_id")
    phase_payload = payload.get("phase_intervals")
    rep_payload = payload.get("rep_intervals")
    if not isinstance(phase_payload, list) or not isinstance(rep_payload, list):
        _fail("REQUIRED_EVIDENCE_MISSING", "SCI-3 phase and repetition intervals are required.")

    phase_results: list[dict[str, Any]] = []
    for index, raw_interval in enumerate(phase_payload):
        interval = _record(raw_interval, f"phase_intervals[{index}]")
        start_index, end_index, requested = _validate_interval(
            interval, f"phase_intervals[{index}]", len(samples), True
        )
        polarity = str(interval["polarity"])
        duration = float(samples[end_index]["time_s"]) - float(samples[start_index]["time_s"])
        displacement = float(samples[end_index]["position_m"]) - float(
            samples[start_index]["position_m"]
        )
        metrics: list[dict[str, Any]] = []
        summary: dict[str, Any] | None = None
        if "PHASE_INTERVAL_AVERAGE_SIGNED_LINEAR_VELOCITY" in requested:
            summary = _find_summary(
                summaries,
                start_index,
                end_index,
                claim_id,
                _text(
                    interval.get("qualification_reference"),
                    f"phase_intervals[{index}].qualification_reference",
                ),
            )
        for metric_id in requested:
            if metric_id == "PHASE_DURATION":
                metrics.append(_metric(metric_id, duration, None, samples))
            elif metric_id == "PHASE_SIGNED_DISPLACEMENT":
                metrics.append(_metric(metric_id, displacement, None, samples))
            elif metric_id == "PHASE_INTERVAL_AVERAGE_SIGNED_LINEAR_VELOCITY":
                assert summary is not None
                metrics.append(
                    _metric(
                        metric_id, float(summary["interval_average_velocity_mps"]), None, samples
                    )
                )
            elif metric_id == "PHASE_DIRECTION_PEAK_SAMPLED_LINEAR_VELOCITY":
                peak, peak_index = _directional_peak(samples, start_index, end_index, polarity)
                metrics.append(_metric(metric_id, peak, peak_index, samples))
            else:
                _fail("UNSUPPORTED_CONFIGURATION", "Unsupported phase metric.", metric_id=metric_id)
        phase_results.append(
            {
                "interval_id": _text(interval.get("id"), f"phase_intervals[{index}].id"),
                "rep_ordinal": _integer(
                    interval.get("rep_ordinal"), f"phase_intervals[{index}].rep_ordinal"
                ),
                "phase_id": _text(interval.get("phase_id"), f"phase_intervals[{index}].phase_id"),
                "phase_ordinal": _integer(
                    interval.get("phase_ordinal"), f"phase_intervals[{index}].phase_ordinal"
                ),
                "phase_action": _text(
                    interval.get("phase_action"), f"phase_intervals[{index}].phase_action"
                ),
                "polarity": polarity,
                "start_index": start_index,
                "end_index": end_index,
                "start_time_s": float(samples[start_index]["time_s"]),
                "end_time_s": float(samples[end_index]["time_s"]),
                "interval_authority": _text(
                    interval.get("interval_authority"),
                    f"phase_intervals[{index}].interval_authority",
                ),
                "qualification_reference": _text(
                    interval.get("qualification_reference"),
                    f"phase_intervals[{index}].qualification_reference",
                ),
                "sci2_interval_summary_id": None if summary is None else summary["id"],
                "metrics": metrics,
            }
        )

    rep_results: list[dict[str, Any]] = []
    for index, raw_interval in enumerate(rep_payload):
        interval = _record(raw_interval, f"rep_intervals[{index}]")
        start_index, end_index, requested = _validate_interval(
            interval, f"rep_intervals[{index}]", len(samples), False
        )
        duration = float(samples[end_index]["time_s"]) - float(samples[start_index]["time_s"])
        rep_results.append(
            {
                "rep_ordinal": _integer(
                    interval.get("rep_ordinal"), f"rep_intervals[{index}].rep_ordinal"
                ),
                "start_index": start_index,
                "end_index": end_index,
                "start_time_s": float(samples[start_index]["time_s"]),
                "end_time_s": float(samples[end_index]["time_s"]),
                "metrics": [
                    _metric("REP_TOTAL_DURATION", duration, None, samples) for _ in requested
                ],
            }
        )

    return {
        "status": "SUCCEEDED",
        "processor": {"id": PROCESSOR_ID, "version": PROCESSOR_VERSION},
        "method": {"id": METHOD_ID, "version": METHOD_VERSION},
        "timebase": {"declared_step_s": step, "declared_sample_count": len(samples)},
        "phase_results": phase_results,
        "rep_results": rep_results,
        "uncertainty": {
            "status": "UNKNOWN",
            "temporal_resolution_s": step,
            "statement": "Temporal resolution is reported separately from metric uncertainty.",
        },
        "diagnostics": {
            "phase_interval_count": len(phase_results),
            "repetition_interval_count": len(rep_results),
            "peak_tie_policy": "EARLIEST_SAMPLE",
            "boundary_policy": "SAMPLE_ALIGNED_ONLY",
            "filtering": "NONE_ADDED",
        },
    }


def _failure_response(failure: EngineFailure) -> dict[str, Any]:
    details = [{"key": key, "value": str(value)} for key, value in sorted(failure.details.items())]
    return {
        "status": "FAILED",
        "failure": {"code": failure.code, "message": failure.message, "details": details},
    }


def main() -> int:
    try:
        raw_payload = json.load(sys.stdin)
        payload = _record(raw_payload, "SCI-4 engine payload")
        response = process(payload)
    except EngineFailure as failure:
        response = _failure_response(failure)
    except Exception as error:  # pragma: no cover - defensive process boundary
        response = {
            "status": "INFRASTRUCTURE_FAILED",
            "exception": {
                "code": "INFRASTRUCTURE_EXCEPTION",
                "message": str(error),
                "details": [],
            },
        }
    sys.stdout.write(json.dumps(response, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
