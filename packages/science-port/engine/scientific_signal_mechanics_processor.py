"""SCI-8 domain-neutral signal and numerical mechanics engine.

This module is deliberately a small numerical runtime boundary.  It accepts
canonical scalar signals from the TypeScript SciencePort adapter and returns
JSON-only numerical artifacts.  Units, provenance, claims, and derivation
lineage remain owned by the TypeScript contract layer.
"""

from __future__ import annotations

import json
import math
import sys
from fractions import Fraction
from typing import Any, cast

import numpy as np
from scipy import signal as scipy_signal

PROCESSOR_ID = "scientific.signal_mechanics"
PROCESSOR_VERSION = "1.0.0"

METHODS = {
    "DERIVATIVE": "signal.derivative.second_order_gradient",
    "INTEGRATE": "signal.integral.trapezoidal",
    "INTERPOLATE": "signal.interpolate.linear",
    "RESAMPLE": "signal.resample.polyphase",
    "FILTER": "signal.filter.butterworth_sos",
    "SYNCHRONIZE": "signal.synchronize.declared_offset",
    "DETECT_EVENTS": "signal.events.threshold_zero_extrema",
    "INTERVAL": "signal.interval.explicit",
}
REGRID_METHOD_ID = "signal.regrid.linear"
METHOD_VERSION = "1.0.0"


class EngineFailure(Exception):
    """A structured, fail-closed scientific input or method failure."""

    def __init__(self, code: str, message: str, **details: object) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details


def _record(value: object, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise EngineFailure("INPUT_INVALID", f"{label} must be an object.")
    return value


def _text(value: object, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise EngineFailure("INPUT_INVALID", f"{label} is required.")
    return value.strip()


def _finite(value: object, label: str, code: str = "INPUT_INVALID") -> float:
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        raise EngineFailure(code, f"{label} must be finite.")
    result = float(value)
    if not math.isfinite(result):
        raise EngineFailure(code, f"{label} must be finite.")
    return result


def _positive(value: object, label: str, code: str = "INPUT_INVALID") -> float:
    result = _finite(value, label, code)
    if result <= 0:
        raise EngineFailure(code, f"{label} must be positive.")
    return result


def _integer(value: object, label: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool):
        raise EngineFailure("INPUT_INVALID", f"{label} must be an integer.")
    return value


def _array(value: object, label: str) -> list[object]:
    if not isinstance(value, list):
        raise EngineFailure("INPUT_INVALID", f"{label} must be an array.")
    return value


def _method(operation: str, options: dict[str, Any] | None = None) -> dict[str, str]:
    method_id = METHODS.get(operation)
    if method_id is None:
        raise EngineFailure("METHOD_NOT_APPLICABLE", "Unsupported SCI-8 operation.")
    if (
        operation == "RESAMPLE"
        and options is not None
        and options.get("grid_policy", options.get("gridPolicy")) == "EXPLICIT_LINEAR_REGRID"
    ):
        method_id = REGRID_METHOD_ID
    return {"id": method_id, "version": METHOD_VERSION}


def _signal(payload: object, label: str = "signal") -> dict[str, Any]:
    source = _record(payload, label)
    signal_id = _text(source.get("signal_id"), f"{label}.signal_id")
    values_raw = _array(source.get("values"), f"{label}.values")
    times_raw = _array(source.get("times_s"), f"{label}.times_s")
    indexes_raw = _array(source.get("sample_indexes"), f"{label}.sample_indexes")
    if len(values_raw) == 0:
        raise EngineFailure("EMPTY_SIGNAL", f"{label} must contain at least one sample.")
    if len(values_raw) != len(times_raw) or len(values_raw) != len(indexes_raw):
        raise EngineFailure(
            "INVALID_TIMEBASE", f"{label} values, times, and sample indexes must align."
        )
    values = np.asarray(
        [
            _finite(value, f"{label}.values[{index}]", "NONFINITE_SAMPLE")
            for index, value in enumerate(values_raw)
        ],
        dtype=np.float64,
    )
    times = np.asarray(
        [
            _finite(value, f"{label}.times_s[{index}]", "NONFINITE_TIMESTAMP")
            for index, value in enumerate(times_raw)
        ],
        dtype=np.float64,
    )
    indexes = [
        _integer(value, f"{label}.sample_indexes[{index}]")
        for index, value in enumerate(indexes_raw)
    ]
    if not np.all(np.diff(times) > 0):
        if np.any(np.diff(times) == 0):
            raise EngineFailure("DUPLICATE_TIMESTAMP", f"{label} contains duplicate timestamps.")
        raise EngineFailure(
            "NON_MONOTONIC_TIME", f"{label} timestamps must be strictly increasing."
        )
    if indexes != list(range(len(indexes))):
        raise EngineFailure(
            "INVALID_TIMEBASE", f"{label} sample indexes must be contiguous from zero."
        )
    unit = _text(source.get("unit"), f"{label}.unit")
    dimension = _text(source.get("dimension"), f"{label}.dimension")
    missing = source.get("missing_sample_indices", [])
    gaps = source.get("gap_intervals", [])
    if not isinstance(missing, list) or not isinstance(gaps, list):
        raise EngineFailure("INPUT_INVALID", f"{label} missingness metadata must be arrays.")
    return {
        "signal_id": signal_id,
        "values": values,
        "times_s": times,
        "sample_indexes": indexes,
        "unit": unit,
        "dimension": dimension,
        "missing_sample_indices": missing,
        "gap_intervals": gaps,
        "timebase": _record(source.get("timebase", {}), f"{label}.timebase"),
    }


def _require_complete(signal: dict[str, Any], operation: str, options: dict[str, Any]) -> None:
    missing = signal["missing_sample_indices"]
    gaps = signal["gap_intervals"]
    if (missing or gaps) and options.get("missing_policy") != "ALLOW_EXPLICIT":
        raise EngineFailure(
            "MISSING_SAMPLE_GAP",
            (
                f"{operation} cannot cross declared missing samples or timestamp gaps "
                "without an explicit policy."
            ),
        )


def _signal_output(
    source: dict[str, Any],
    values: np.ndarray,
    times: np.ndarray | None = None,
    *,
    unit: str | None = None,
    dimension: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    output_times = source["times_s"] if times is None else times
    output = {
        "kind": "signal",
        "signal_id": source["signal_id"] + ".derived",
        "values": [float(value) for value in values],
        "times_s": [float(value) for value in output_times],
        "sample_indexes": list(range(len(values))),
        "unit": unit or source["unit"],
        "dimension": dimension or source["dimension"],
    }
    if metadata:
        output.update(metadata)
    return output


def _canonical_output_dimension(operation: str, source: dict[str, Any]) -> tuple[str, str]:
    dimension = source["dimension"]
    if operation == "DERIVATIVE":
        if dimension == "length":
            return "m/s", "speed"
        if dimension == "speed":
            return "m/s^2", "acceleration"
        raise EngineFailure(
            "DIMENSION_MISMATCH", "Derivative output dimension is not declared for this signal."
        )
    if operation == "INTEGRATE":
        if dimension == "speed":
            return "m", "length"
        if dimension == "acceleration":
            return "m/s", "speed"
        if dimension == "force":
            return "N*s", "impulse"
        raise EngineFailure(
            "DIMENSION_MISMATCH", "Integral output dimension is not declared for this signal."
        )
    return source["unit"], dimension


def _derivative(source: dict[str, Any], options: dict[str, Any]) -> dict[str, Any]:
    _require_complete(source, "DERIVATIVE", options)
    order = _integer(options.get("order", 1), "derivative order")
    if order not in {1, 2}:
        raise EngineFailure(
            "METHOD_NOT_APPLICABLE", "Only first and second derivatives are supported."
        )
    minimum = 3 if order == 1 else 5
    if len(source["values"]) < minimum:
        raise EngineFailure(
            "INSUFFICIENT_SAMPLES", f"Derivative order {order} requires at least {minimum} samples."
        )
    values = np.gradient(source["values"], source["times_s"], edge_order=2)
    method_identity = (
        "SECOND_ORDER_NONUNIFORM_GRADIENT" if order == 1 else "REPEATED_FIRST_SECOND_ORDER_GRADIENT"
    )
    if order == 2:
        values = np.gradient(values, source["times_s"], edge_order=2)
    unit, dimension = _canonical_output_dimension("DERIVATIVE", source)
    if not np.all(np.isfinite(values)):
        raise EngineFailure("NUMERICAL_OVERFLOW", "Derivative output is non-finite.")
    return _signal_output(
        source,
        values,
        unit=unit,
        dimension=dimension,
        metadata={
            "method_detail": method_identity,
            "grid_assumption": "EXPLICIT_MONOTONIC_COORDINATES",
            "boundary_treatment": "SECOND_ORDER_ONE_SIDED",
            "formal_order": 2,
        },
    )


def _integrate(source: dict[str, Any], options: dict[str, Any]) -> dict[str, Any]:
    _require_complete(source, "INTEGRATE", options)
    if len(source["values"]) < 2:
        raise EngineFailure("INSUFFICIENT_SAMPLES", "Integration requires at least two samples.")
    initial = _finite(options.get("initial_value"), "initial_value", "INVALID_INITIAL_CONDITION")
    mode = _text(options.get("mode", "CUMULATIVE"), "integration mode")
    unit, dimension = _canonical_output_dimension("INTEGRATE", source)
    increments = np.diff(source["times_s"]) * (source["values"][1:] + source["values"][:-1]) / 2.0
    if not np.all(np.isfinite(increments)):
        raise EngineFailure("NUMERICAL_OVERFLOW", "Integral output is non-finite.")
    if mode == "INTERVAL":
        return {
            "kind": "quantity",
            "value": float(initial + np.sum(increments)),
            "unit": unit,
            "dimension": dimension,
            "start_time_s": float(source["times_s"][0]),
            "end_time_s": float(source["times_s"][-1]),
            "initial_condition": float(initial),
        }
    if mode != "CUMULATIVE":
        raise EngineFailure(
            "METHOD_NOT_APPLICABLE", "Integration mode must be INTERVAL or CUMULATIVE."
        )
    cumulative = np.concatenate((np.asarray([initial]), initial + np.cumsum(increments)))
    return _signal_output(
        source,
        cumulative,
        unit=unit,
        dimension=dimension,
        metadata={
            "method_detail": "COMPOSITE_TRAPEZOID_CUMULATIVE",
            "initial_condition": float(initial),
        },
    )


def _interpolate(source: dict[str, Any], options: dict[str, Any]) -> dict[str, Any]:
    target = _finite(options.get("target_time_s"), "target_time_s", "INVALID_TIMEBASE")
    if target < source["times_s"][0] or target > source["times_s"][-1]:
        raise EngineFailure(
            "INTERPOLATION_OUTSIDE_DOMAIN",
            "Interpolation does not extrapolate outside the source domain.",
        )
    right = int(np.searchsorted(source["times_s"], target, side="left"))
    if right == 0:
        left = 0
        right = 0
    elif right == len(source["times_s"]):
        left = len(source["times_s"]) - 1
        right = left
    else:
        left = right - 1
        if source["times_s"][right] == target:
            left = right
    value = float(np.interp(target, source["times_s"], source["values"]))
    return {
        "kind": "sample",
        "signal_id": source["signal_id"] + ".interpolated",
        "value": value,
        "time_s": target,
        "unit": source["unit"],
        "dimension": source["dimension"],
        "bracketing": {
            "left_index": left,
            "right_index": right,
            "left_time_s": float(source["times_s"][left]),
            "right_time_s": float(source["times_s"][right]),
        },
    }


def _uniform_rate(source: dict[str, Any]) -> float:
    steps = np.diff(source["times_s"])
    if len(steps) == 0:
        raise EngineFailure(
            "INSUFFICIENT_SAMPLES", "A sampling rate requires at least two samples."
        )
    nominal = float(np.median(steps))
    tolerance = max(1e-12, abs(nominal) * 1e-9)
    if not np.all(np.abs(steps - nominal) <= tolerance):
        raise EngineFailure(
            "IRREGULAR_TIMEBASE_UNSUPPORTED",
            "Polyphase resampling requires a uniform source timebase.",
        )
    return 1.0 / nominal


def _target_times(source: dict[str, Any], rate: float, count: int) -> np.ndarray:
    start = float(source["times_s"][0])
    return cast(np.ndarray, start + np.arange(count, dtype=np.float64) / rate)


def _resample(source: dict[str, Any], options: dict[str, Any]) -> dict[str, Any]:
    _require_complete(source, "RESAMPLE", options)
    target_rate = _positive(
        options.get("target_rate_hz"), "target_rate_hz", "INVALID_RESAMPLE_RATE"
    )
    if source["timebase"].get("classification") == "IRREGULAR":
        if options.get("grid_policy", options.get("gridPolicy")) != "EXPLICIT_LINEAR_REGRID":
            raise EngineFailure(
                "IRREGULAR_TIMEBASE_UNSUPPORTED",
                "Irregular-to-uniform conversion requires explicit linear regridding policy.",
            )
        target_raw = options.get("target_times_s", options.get("targetTimesS"))
        if target_raw is None:
            count = math.floor((source["times_s"][-1] - source["times_s"][0]) * target_rate) + 1
            target_times = _target_times(source, target_rate, count)
        else:
            target_times = np.asarray(
                [
                    _finite(value, "target_times_s", "NONFINITE_TIMESTAMP")
                    for value in _array(target_raw, "target_times_s")
                ],
                dtype=np.float64,
            )
        if len(target_times) == 0 or not np.all(np.diff(target_times) > 0):
            raise EngineFailure(
                "INVALID_TIMEBASE", "Explicit regrid target times must be strictly increasing."
            )
        if target_times[0] < source["times_s"][0] or target_times[-1] > source["times_s"][-1]:
            raise EngineFailure(
                "INTERPOLATION_OUTSIDE_DOMAIN", "Explicit regridding does not extrapolate."
            )
        values = np.interp(target_times, source["times_s"], source["values"])
        return _signal_output(
            source,
            np.asarray(values, dtype=np.float64),
            target_times,
            metadata={
                "method_detail": "EXPLICIT_LINEAR_REGRID",
                "source_timebase": "IRREGULAR",
                "target_rate_hz": target_rate,
                "anti_aliasing": "NOT_APPLICABLE_INTERPOLATION_REGRID",
                "extrapolation": "FORBIDDEN",
            },
        )
    source_rate = _uniform_rate(source)
    ratio = Fraction(target_rate / source_rate).limit_denominator(10000)
    up, down = ratio.numerator, ratio.denominator
    window = options.get("window", ("kaiser", 5.0))
    if isinstance(window, list):
        window = tuple(window)
    values = scipy_signal.resample_poly(
        source["values"],
        up,
        down,
        window=window,
        padtype=_text(options.get("padtype", "line"), "resample padtype"),
    )
    if not np.all(np.isfinite(values)):
        raise EngineFailure("NUMERICAL_OVERFLOW", "Resampling output is non-finite.")
    times = _target_times(source, target_rate, len(values))
    downsampled = target_rate < source_rate
    return _signal_output(
        source,
        np.asarray(values, dtype=np.float64),
        times,
        metadata={
            "method_detail": "POLYPHASE_FIR",
            "source_rate_hz": source_rate,
            "target_rate_hz": target_rate,
            "rational_up": up,
            "rational_down": down,
            "anti_aliasing": "EXPLICIT_POLYPHASE_LOW_PASS_FIR"
            if downsampled
            else "NOT_REQUIRED_FOR_UPSAMPLE",
            "window": options.get("window", ["kaiser", 5.0]),
            "boundary": options.get("padtype", "line"),
        },
    )


def _filter(source: dict[str, Any], options: dict[str, Any]) -> dict[str, Any]:
    _require_complete(source, "FILTER", options)
    sample_rate = _positive(options.get("sample_rate_hz"), "sample_rate_hz", "INVALID_TIMEBASE")
    order = _integer(options.get("order"), "filter order")
    if order < 1:
        raise EngineFailure("INVALID_FILTER_ORDER", "Filter order must be a positive integer.")
    filter_type = _text(options.get("filter_type"), "filter_type").upper()
    if filter_type not in {"LOWPASS", "HIGHPASS", "BANDPASS"}:
        raise EngineFailure("METHOD_NOT_APPLICABLE", "Unsupported Butterworth filter type.")
    cutoff_raw = options.get("cutoff_hz")
    if filter_type == "BANDPASS":
        cutoffs = [
            _positive(value, "cutoff_hz", "INVALID_CUTOFF")
            for value in _array(cutoff_raw, "cutoff_hz")
        ]
        if len(cutoffs) != 2 or cutoffs[0] >= cutoffs[1]:
            raise EngineFailure("INVALID_CUTOFF", "Band-pass cutoffs must be strictly ordered.")
        normalized_cutoff: float | list[float] = cutoffs
    else:
        normalized_cutoff = _positive(cutoff_raw, "cutoff_hz", "INVALID_CUTOFF")
        if normalized_cutoff >= sample_rate / 2:
            raise EngineFailure(
                "CUTOFF_ABOVE_NYQUIST", "Filter cutoff must be below the Nyquist frequency."
            )
    if isinstance(normalized_cutoff, list) and normalized_cutoff[1] >= sample_rate / 2:
        raise EngineFailure(
            "CUTOFF_ABOVE_NYQUIST", "Filter cutoff must be below the Nyquist frequency."
        )
    mode = _text(options.get("mode"), "filter mode").upper()
    online = bool(options.get("online", False))
    if mode == "ZERO_PHASE" and online:
        raise EngineFailure(
            "ZERO_PHASE_NOT_ALLOWED_ONLINE",
            "Zero-phase filtering is not available for online execution.",
        )
    if mode not in {"CAUSAL", "ZERO_PHASE"}:
        raise EngineFailure("METHOD_NOT_APPLICABLE", "Filter mode must be CAUSAL or ZERO_PHASE.")
    sos = scipy_signal.butter(
        order, normalized_cutoff, btype=filter_type.lower(), fs=sample_rate, output="sos"
    )
    padtype = _text(options.get("padtype", "odd"), "filter padtype")
    padlen = _integer(options.get("padlen", 3 * (2 * len(sos) + 1)), "filter padlen")
    if mode == "ZERO_PHASE" and len(source["values"]) <= padlen:
        raise EngineFailure(
            "SIGNAL_TOO_SHORT_FOR_FILTER",
            "Signal is shorter than the explicit zero-phase padding requirement.",
        )
    if mode == "CAUSAL":
        filtered = scipy_signal.sosfilt(sos, source["values"])
    else:
        filtered = scipy_signal.sosfiltfilt(sos, source["values"], padtype=padtype, padlen=padlen)
    if not np.all(np.isfinite(filtered)):
        raise EngineFailure("NUMERICAL_OVERFLOW", "Filter output is non-finite.")
    return _signal_output(
        source,
        np.asarray(filtered, dtype=np.float64),
        metadata={
            "method_detail": "BUTTERWORTH_SECOND_ORDER_SECTIONS",
            "filter_family": "BUTTERWORTH",
            "filter_type": filter_type,
            "order": order,
            "cutoff_hz": normalized_cutoff,
            "sample_rate_hz": sample_rate,
            "mode": mode,
            "causal": mode == "CAUSAL",
            "zero_phase": mode == "ZERO_PHASE",
            "padtype": padtype,
            "padlen": padlen,
        },
    )


def _synchronize(
    source: dict[str, Any], reference: dict[str, Any], options: dict[str, Any]
) -> dict[str, Any]:
    offset = _finite(options.get("offset_s"), "offset_s", "UNKNOWN_TIME_OFFSET")
    alignment = _text(options.get("alignment_mode"), "alignment_mode").upper()
    corrected_times = source["times_s"] + offset
    tolerance = float(options.get("time_tolerance_s", 1e-12))
    if tolerance < 0 or not math.isfinite(tolerance):
        raise EngineFailure("INVALID_TIMEBASE", "time_tolerance_s must be finite and non-negative.")
    if alignment == "EXACT_COMMON_TIMESTAMPS":
        if len(corrected_times) != len(reference["times_s"]) or not np.allclose(
            corrected_times, reference["times_s"], atol=tolerance, rtol=0
        ):
            raise EngineFailure(
                "INVALID_TIMEBASE", "Declared synchronization did not produce common timestamps."
            )
        values = source["values"]
        times = reference["times_s"]
        interpolation = "NONE"
    elif alignment == "OFFSET_THEN_EXPLICIT_INTERPOLATION":
        if (
            reference["times_s"][0] < corrected_times[0]
            or reference["times_s"][-1] > corrected_times[-1]
        ):
            raise EngineFailure(
                "INTERPOLATION_OUTSIDE_DOMAIN", "Synchronization interpolation would extrapolate."
            )
        values = np.interp(reference["times_s"], corrected_times, source["values"])
        times = reference["times_s"]
        interpolation = "LINEAR_EXPLICIT"
    else:
        raise EngineFailure(
            "METHOD_NOT_APPLICABLE",
            "Synchronization requires an explicit supported alignment mode.",
        )
    return _signal_output(
        source,
        np.asarray(values, dtype=np.float64),
        np.asarray(times, dtype=np.float64),
        metadata={
            "method_detail": "DECLARED_CONSTANT_OFFSET",
            "offset_s": offset,
            "reference_signal_id": reference["signal_id"],
            "alignment_mode": alignment,
            "interpolation": interpolation,
            "historical_times_s": [float(value) for value in source["times_s"]],
        },
    )


def _event(
    index: int,
    time_s: float,
    value: float,
    direction: str,
    left: int,
    right: int,
    left_time: float,
    right_time: float,
) -> dict[str, Any]:
    return {
        "index": index,
        "time_s": float(time_s),
        "value": float(value),
        "direction": direction,
        "bracketing": {
            "left_index": left,
            "right_index": right,
            "left_time_s": float(left_time),
            "right_time_s": float(right_time),
        },
    }


def _events(source: dict[str, Any], options: dict[str, Any]) -> dict[str, Any]:
    kind = _text(options.get("kind"), "event kind").upper()
    events: list[dict[str, Any]] = []
    values = source["values"]
    times = source["times_s"]
    if kind in {"THRESHOLD", "ZERO_CROSSING"}:
        threshold = (
            0.0
            if kind == "ZERO_CROSSING"
            else _finite(options.get("threshold"), "threshold", "INVALID_EVENT_THRESHOLD")
        )
        direction = _text(options.get("direction", "EITHER"), "event direction").upper()
        if direction not in {"RISING", "FALLING", "EITHER"}:
            raise EngineFailure(
                "INVALID_EVENT_THRESHOLD", "Event direction must be RISING, FALLING, or EITHER."
            )
        timing = _text(options.get("timing", "SAMPLE_ALIGNED"), "event timing").upper()
        if timing not in {"SAMPLE_ALIGNED", "LINEAR"}:
            raise EngineFailure(
                "METHOD_NOT_APPLICABLE", "Event timing must be SAMPLE_ALIGNED or LINEAR."
            )
        for index in range(1, len(values)):
            previous = float(values[index - 1] - threshold)
            current = float(values[index] - threshold)
            rising = previous < 0 <= current
            falling = previous > 0 >= current
            if current == 0 and previous == 0:
                continue
            if not (
                (direction in {"RISING", "EITHER"} and rising)
                or (direction in {"FALLING", "EITHER"} and falling)
            ):
                continue
            event_direction = "RISING" if rising else "FALLING"
            if timing == "LINEAR" and current != previous:
                fraction = -previous / (current - previous)
                time_s = float(times[index - 1] + fraction * (times[index] - times[index - 1]))
                value = threshold
            else:
                time_s = float(times[index] if current != 0 else times[index - 1])
                value = threshold if current == 0 else float(values[index])
            event_index = index
            events.append(
                _event(
                    event_index,
                    time_s,
                    value,
                    event_direction,
                    index - 1,
                    index,
                    times[index - 1],
                    times[index],
                )
            )
    elif kind == "EXTREMUM":
        direction = _text(options.get("direction"), "extremum direction").upper()
        scope = _text(options.get("scope", "LOCAL"), "extremum scope").upper()
        if direction not in {"MAX", "MIN"} or scope not in {"LOCAL", "GLOBAL"}:
            raise EngineFailure(
                "METHOD_NOT_APPLICABLE",
                "Extrema require direction MAX or MIN and scope LOCAL or GLOBAL.",
            )
        if scope == "GLOBAL":
            index = int(np.argmax(values) if direction == "MAX" else np.argmin(values))
            events.append(
                _event(
                    index,
                    times[index],
                    values[index],
                    direction,
                    index,
                    index,
                    times[index],
                    times[index],
                )
            )
        else:
            for index in range(1, len(values) - 1):
                is_extremum = (
                    values[index] >= values[index - 1] and values[index] >= values[index + 1]
                    if direction == "MAX"
                    else values[index] <= values[index - 1] and values[index] <= values[index + 1]
                )
                if is_extremum:
                    events.append(
                        _event(
                            index,
                            times[index],
                            values[index],
                            direction,
                            index,
                            index,
                            times[index],
                            times[index],
                        )
                    )
    else:
        raise EngineFailure("METHOD_NOT_APPLICABLE", "Unsupported event detector.")
    return {
        "kind": "events",
        "signal_id": source["signal_id"],
        "events": events,
        "event_kind": kind,
        "method_detail": "DETERMINISTIC_SAMPLED_BRACKETED_EVENTS",
    }


def _interval(source: dict[str, Any], options: dict[str, Any]) -> dict[str, Any]:
    start = _integer(options.get("start_index"), "start_index")
    end = _integer(options.get("end_index"), "end_index")
    start_inclusive = bool(options.get("start_inclusive", True))
    end_inclusive = bool(options.get("end_inclusive", True))
    if start < 0 or end >= len(source["times_s"]) or start > end:
        raise EngineFailure(
            "INPUT_INVALID", "Interval indexes must be ordered and within the signal."
        )
    return {
        "kind": "interval",
        "signal_id": source["signal_id"],
        "start_index": start,
        "end_index": end,
        "start_time_s": float(source["times_s"][start]),
        "end_time_s": float(source["times_s"][end]),
        "start_inclusive": start_inclusive,
        "end_inclusive": end_inclusive,
        "duration_s": float(source["times_s"][end] - source["times_s"][start]),
    }


def process(payload: dict[str, Any]) -> dict[str, Any]:
    envelope = _record(payload, "SCI-8 payload")
    processor = _record(envelope.get("processor"), "processor")
    if processor.get("id") != PROCESSOR_ID or processor.get("version") != PROCESSOR_VERSION:
        raise EngineFailure("UNSUPPORTED_CONFIGURATION", "Unsupported SCI-8 processor identity.")
    operation = _text(envelope.get("operation"), "operation").upper()
    options = _record(envelope.get("options", {}), "options")
    method = _method(operation, options)
    source = _signal(envelope.get("signal"))
    if operation == "DERIVATIVE":
        output = _derivative(source, options)
    elif operation == "INTEGRATE":
        output = _integrate(source, options)
    elif operation == "INTERPOLATE":
        output = _interpolate(source, options)
    elif operation == "RESAMPLE":
        output = _resample(source, options)
    elif operation == "FILTER":
        output = _filter(source, options)
    elif operation == "SYNCHRONIZE":
        output = _synchronize(source, _signal(envelope.get("reference"), "reference"), options)
    elif operation == "DETECT_EVENTS":
        output = _events(source, options)
    elif operation == "INTERVAL":
        output = _interval(source, options)
    else:  # pragma: no cover - _method rejects first
        raise EngineFailure("METHOD_NOT_APPLICABLE", "Unsupported SCI-8 operation.")
    return {
        "status": "SUCCEEDED",
        "processor": {"id": PROCESSOR_ID, "version": PROCESSOR_VERSION},
        "method": method,
        "operation": operation,
        "output": output,
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
                "message": "The SCI-8 engine could not decode its transport envelope.",
                "details": [{"key": "error_type", "value": type(error).__name__}],
            },
        }
    except Exception as error:  # pragma: no cover - defensive process boundary
        result = {
            "status": "INFRASTRUCTURE_FAILED",
            "exception": {
                "code": "INFRASTRUCTURE_EXCEPTION",
                "message": "The SCI-8 engine failed outside the scientific input contract.",
                "details": [{"key": "error_type", "value": type(error).__name__}],
            },
        }
    print(json.dumps(result, allow_nan=False, separators=(",", ":")))


if __name__ == "__main__":
    _main()
