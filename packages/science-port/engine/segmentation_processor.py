"""SCI-3 protocol-driven repetition and phase segmentation engine.

This module intentionally owns only sampled boundary detection. It does not
filter, interpolate, infer exercise identity, estimate performance, or repair
input. The TypeScript SciencePort validates the public contract and supplies a
canonical transport envelope; this standard-library engine validates the
numeric and protocol envelope again before processing it.
"""

from __future__ import annotations

import json
import math
import re
import sys
from dataclasses import dataclass
from typing import Any, NoReturn

CAPABILITY_ID = "resistance_training.segment_repetitions_from_kinematics"
PROCESSOR_ID = CAPABILITY_ID
PROCESSOR_VERSION = "1.0.0"
METHOD_ID = "state_machine.directional_hysteresis.sample_boundaries"
METHOD_VERSION = "1.0.0"

SUPPORTED_TASK_CLASS = "ONE_DIMENSIONAL_BIDIRECTIONAL_IMPLEMENT_MOTION_2_PHASE"
SHA_PATTERN = re.compile(r"^[0-9a-f]{40,64}$", re.IGNORECASE)
OBJECT_KINDS = {
    "ATHLETE",
    "ATHLETE_BODY_COM",
    "ATHLETE_PLUS_EXTERNAL_LOAD_SYSTEM",
    "IMPLEMENT",
    "BODY_SEGMENT",
    "EXTERNAL_OBJECT",
    "MEASUREMENT_POINT",
    "CUSTOM_DECLARED_OBJECT",
}
FRAME_KINDS = {
    "GLOBAL_LAB",
    "BODY",
    "SEGMENT_LOCAL",
    "IMPLEMENT",
    "DEVICE",
    "CUSTOM_DECLARED",
}
AXES = {"X", "Y", "Z", "CUSTOM"}
SENSES = {"POSITIVE", "NEGATIVE", "UNSPECIFIED"}
MODALITIES = {
    "POSITION_TRANSDUCER",
    "ENCODER",
    "FORCE_PLATFORM",
    "INERTIAL_SENSOR",
    "VIDEO_KINEMATICS",
    "TIMING_GATE",
    "MANUAL_OBSERVATION",
    "CUSTOM_DECLARED",
}


class EngineFailure(Exception):
    """Structured, expected scientific input failure."""

    def __init__(
        self,
        code: str,
        message: str,
        details: list[dict[str, str]] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details or []


@dataclass(frozen=True)
class Run:
    state: str
    start: int
    end: int

    @property
    def length(self) -> int:
        return self.end - self.start + 1


def _fail(code: str, message: str, **details: object) -> NoReturn:
    raise EngineFailure(
        code,
        message,
        [{"key": key, "value": str(value)} for key, value in details.items()],
    )


def _record(value: object, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        _fail("INPUT_INVALID", f"{label} must be an object.")
    return value


def _text(value: object, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        _fail("REQUIRED_EVIDENCE_MISSING", f"{label} is required.")
    return value.strip()


def _finite(value: object, label: str) -> float:
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        _fail("NON_FINITE_SAMPLE", f"{label} must be numeric.")
    result = float(value)
    if not math.isfinite(result):
        _fail("NON_FINITE_SAMPLE", f"{label} must be finite.")
    return result


def _positive_number(value: object, label: str) -> float:
    result = _finite(value, label)
    if result <= 0:
        _fail("UNSUPPORTED_CONFIGURATION", f"{label} must be positive.")
    return result


def _positive_integer(value: object, label: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < 1:
        _fail("UNSUPPORTED_CONFIGURATION", f"{label} must be a positive integer.")
    return value


def _identity(value: object, label: str) -> dict[str, Any]:
    identity = _record(value, label)
    _text(identity.get("id"), f"{label}.id")
    _text(identity.get("version"), f"{label}.version")
    revision = identity.get("revision")
    if not isinstance(revision, int) or isinstance(revision, bool) or revision < 1:
        _fail("PROTOCOL_INCOMPATIBLE", f"{label}.revision must be a positive integer.")
    return identity


def _same_identity(left: dict[str, Any], right: dict[str, Any]) -> bool:
    return (
        left.get("id") == right.get("id")
        and left.get("version") == right.get("version")
        and left.get("revision") == right.get("revision")
    )


def _same_frame(left: dict[str, Any], right: dict[str, Any]) -> bool:
    return (
        left.get("frame_kind") == right.get("frame_kind")
        and left.get("frame_id") == right.get("frame_id")
        and left.get("convention") == right.get("convention")
    )


def _validate_configuration(value: object) -> dict[str, Any]:
    configuration = _record(value, "configuration")
    enter = _positive_number(
        configuration.get("velocity_enter_threshold_mps"),
        "configuration.velocity_enter_threshold_mps",
    )
    exit_threshold = _positive_number(
        configuration.get("velocity_exit_threshold_mps"),
        "configuration.velocity_exit_threshold_mps",
    )
    if exit_threshold >= enter:
        _fail(
            "UNSUPPORTED_CONFIGURATION",
            "The velocity exit threshold must be lower than the enter threshold.",
        )
    for key in (
        "minimum_sustained_samples",
        "minimum_preroll_samples",
        "minimum_postroll_samples",
    ):
        _positive_integer(configuration.get(key), f"configuration.{key}")
    for key in (
        "minimum_phase_duration_s",
        "minimum_repetition_duration_s",
    ):
        _positive_number(configuration.get(key), f"configuration.{key}")
    min_excursion = _positive_number(
        configuration.get("minimum_excursion_m"),
        "configuration.minimum_excursion_m",
    )
    absolute_tolerance = _finite(
        configuration.get("uniform_absolute_tolerance_s"),
        "configuration.uniform_absolute_tolerance_s",
    )
    relative_tolerance = _finite(
        configuration.get("uniform_relative_tolerance"),
        "configuration.uniform_relative_tolerance",
    )
    if absolute_tolerance < 0 or relative_tolerance < 0:
        _fail(
            "UNSUPPORTED_CONFIGURATION",
            "Uniform timebase tolerances cannot be negative.",
        )
    if configuration.get("filtering") != "NONE":
        _fail(
            "UNSUPPORTED_CONFIGURATION",
            "SCI-3 v1 accepts only FILTERING=NONE; filtering cannot be implicit.",
        )
    if configuration.get("interpolation") != "NONE":
        _fail(
            "UNSUPPORTED_CONFIGURATION",
            "SCI-3 v1 accepts only INTERPOLATION=NONE.",
        )
    if configuration.get("dwell_policy") != "ALLOWED":
        _fail(
            "UNSUPPORTED_CONFIGURATION",
            "SCI-3 v1 requires an explicit ALLOWED dwell policy.",
        )
    if configuration.get("boundary_policy") != "SAMPLED_ONLY_NO_INTERPOLATION":
        _fail(
            "UNSUPPORTED_CONFIGURATION",
            "SCI-3 v1 reports observed sample boundaries only.",
        )
    return {
        **configuration,
        "velocity_enter_threshold_mps": enter,
        "velocity_exit_threshold_mps": exit_threshold,
        "minimum_excursion_m": min_excursion,
        "uniform_absolute_tolerance_s": absolute_tolerance,
        "uniform_relative_tolerance": relative_tolerance,
    }


def _validate_time_series(
    payload: dict[str, Any],
) -> tuple[list[dict[str, Any]], float, dict[str, Any]]:
    raw_samples = payload.get("samples")
    if not isinstance(raw_samples, list) or len(raw_samples) < 4:
        _fail("INSUFFICIENT_SAMPLES", "SCI-3 requires at least four aligned kinematic samples.")
    timebase = _record(payload.get("timebase"), "timebase")
    declared_count = timebase.get("declared_sample_count")
    if declared_count != len(raw_samples):
        _fail(
            "MISSING_SAMPLE_UNSUPPORTED",
            "The declared sample count must equal the complete aligned sample series.",
        )
    declared_step = _positive_number(
        timebase.get("declared_time_step_s"), "timebase.declared_time_step_s"
    )
    _text(timebase.get("provenance_reference"), "timebase.provenance_reference")
    configuration = _validate_configuration(payload.get("configuration"))
    samples: list[dict[str, Any]] = []
    previous_time: float | None = None
    previous_step: float | None = None
    for expected_index, raw_sample in enumerate(raw_samples):
        sample = _record(raw_sample, f"samples[{expected_index}]")
        sample_index = sample.get("sample_index")
        if sample_index != expected_index:
            _fail(
                "MISSING_SAMPLE_UNSUPPORTED",
                "Sample indexes must be complete consecutive integers; no repair is performed.",
                sample_index=expected_index,
            )
        time_s = _finite(sample.get("time_s"), f"samples[{expected_index}].time_s")
        position_m = _finite(sample.get("position_m"), f"samples[{expected_index}].position_m")
        velocity_mps = _finite(
            sample.get("velocity_mps"), f"samples[{expected_index}].velocity_mps"
        )
        if previous_time is not None:
            step = time_s - previous_time
            if not math.isfinite(step):
                _fail("NUMERICAL_OVERFLOW", "Sample time subtraction overflowed.")
            if step <= 0:
                if step == 0:
                    _fail("DUPLICATE_TIMESTAMP", "Sample timestamps must be strictly increasing.")
                _fail("NON_MONOTONIC_TIME", "Sample timestamps must be strictly increasing.")
            tolerance = max(
                configuration["uniform_absolute_tolerance_s"],
                configuration["uniform_relative_tolerance"]
                * max(abs(step), abs(declared_step), 1.0),
            )
            if abs(step - declared_step) > tolerance:
                _fail(
                    "IRREGULAR_TIMEBASE_UNSUPPORTED",
                    "SCI-3 v1 rejects irregular sampling instead of resampling it.",
                    sample_index=expected_index,
                )
            if previous_step is not None and abs(step - previous_step) > tolerance:
                _fail(
                    "IRREGULAR_TIMEBASE_UNSUPPORTED",
                    "SCI-3 v1 requires one uniform declared timebase.",
                    sample_index=expected_index,
                )
            previous_step = step
        previous_time = time_s
        samples.append(
            {
                "sample_index": sample_index,
                "time_s": time_s,
                "position_m": position_m,
                "velocity_mps": velocity_mps,
            }
        )
    return samples, declared_step, configuration


def _validate_measurement(payload: dict[str, Any]) -> dict[str, Any]:
    measurement = _record(payload.get("measurement"), "measurement")
    object_of_interest = _record(
        measurement.get("object_of_interest"), "measurement.object_of_interest"
    )
    if object_of_interest.get("object_kind") not in OBJECT_KINDS:
        _fail("OBJECT_BINDING_MISSING", "The object of interest kind is unsupported.")
    _text(object_of_interest.get("object_id"), "measurement.object_of_interest.object_id")
    measurement_point = _record(
        measurement.get("measurement_point"), "measurement.measurement_point"
    )
    if measurement_point.get("object_kind") != "MEASUREMENT_POINT":
        _fail(
            "MEASUREMENT_POINT_BINDING_MISSING",
            "The measurement point must be explicitly declared as MEASUREMENT_POINT.",
        )
    _text(measurement_point.get("object_id"), "measurement.measurement_point.object_id")
    reference_frame = _record(measurement.get("reference_frame"), "measurement.reference_frame")
    if reference_frame.get("frame_kind") not in FRAME_KINDS:
        _fail("REFERENCE_FRAME_MISSING", "The reference frame kind is unsupported.")
    _text(reference_frame.get("frame_id"), "measurement.reference_frame.frame_id")
    axis = _record(measurement.get("axis"), "measurement.axis")
    if axis.get("axis") not in AXES or axis.get("sense") not in SENSES:
        _fail("AXIS_BINDING_MISSING", "The axis declaration is unsupported.")
    axis_frame = _record(axis.get("frame"), "measurement.axis.frame")
    if not _same_frame(reference_frame, axis_frame):
        _fail("AXIS_BINDING_MISSING", "The axis must use the declared reference frame.")
    modality = _record(measurement.get("modality"), "measurement.modality")
    if modality.get("kind") not in MODALITIES:
        _fail("INPUT_INVALID", "The measurement modality kind is unsupported.")
    _text(measurement.get("assessment_id"), "measurement.assessment_id")
    _text(measurement.get("trial_id"), "measurement.trial_id")
    quality = _record(measurement.get("quality"), "measurement.quality")
    for key, expected in (
        ("input", "VALID"),
        ("acquisition", "VALID"),
        ("trial", "VALID"),
        ("protocol", "APPLICABLE"),
    ):
        if quality.get(key) != expected:
            code = "PROTOCOL_INCOMPATIBLE" if key == "protocol" else "TRIAL_INVALID"
            _fail(code, f"measurement.quality.{key} must be {expected}.")
    if quality.get("exclusion") == "EXCLUDED":
        _fail("TRIAL_EXCLUDED", "Excluded trials cannot produce a segmentation.")
    if measurement.get("calibration_status") not in {"CALIBRATED", "NOT_REQUIRED"}:
        _fail(
            "CALIBRATION_REQUIREMENT_UNSATISFIED",
            "SCI-3 v1 accepts only CALIBRATED or NOT_REQUIRED input calibration states.",
        )
    return measurement


def _validate_sci2_lineage(payload: dict[str, Any]) -> dict[str, Any]:
    lineage = _record(payload.get("sci2_lineage"), "sci2_lineage")
    claim_id = _text(lineage.get("claim_id"), "sci2_lineage.claim_id")
    processor = _record(lineage.get("processor"), "sci2_lineage.processor")
    if (
        processor.get("id") != "resistance_training.linear_velocity_from_position"
        or processor.get("version") != "1.0.0"
    ):
        _fail("PROTOCOL_INCOMPATIBLE", "SCI-3 requires a SCI-2 v1 position-to-velocity claim.")
    method = _record(lineage.get("method"), "sci2_lineage.method")
    if (
        method.get("id") != "finite_difference.second_order_uniform"
        or method.get("version") != "1.0.0"
    ):
        _fail(
            "PROTOCOL_INCOMPATIBLE",
            "SCI-3 requires the qualified SCI-2 uniform finite-difference method.",
        )
    software = _record(lineage.get("software"), "sci2_lineage.software")
    for key in ("package_name", "package_version", "source_revision", "build_id"):
        _text(software.get(key), f"sci2_lineage.software.{key}")
    if not SHA_PATTERN.fullmatch(software["source_revision"]):
        _fail("PROTOCOL_INCOMPATIBLE", "SCI-2 lineage must bind an exact source SHA.")
    qualification = _record(lineage.get("qualification"), "sci2_lineage.qualification")
    if qualification.get("status") != "QUALIFIED":
        _fail("PROTOCOL_INCOMPATIBLE", "SCI-3 requires an explicitly QUALIFIED SCI-2 claim.")
    if (
        qualification.get("source_revision") != software["source_revision"]
        or qualification.get("build_id") != software["build_id"]
    ):
        _fail(
            "PROTOCOL_INCOMPATIBLE",
            "SCI-2 qualification and software provenance must match exactly.",
        )
    return {**lineage, "claim_id": claim_id}


def _validate_task_and_protocol(
    payload: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any], list[dict[str, Any]]]:
    task = _record(payload.get("movement_task"), "movement_task")
    if task.get("kind") != "MOVEMENT_TASK":
        _fail("PROTOCOL_INCOMPATIBLE", "A versioned MovementTask is required.")
    task_identity = _identity(task, "movement_task")
    raw_phases = task.get("phases")
    if not isinstance(raw_phases, list) or not raw_phases:
        _fail("PHASE_DEFINITION_MISSING", "MovementTask phases are required.")
    phases_by_id: dict[str, dict[str, Any]] = {}
    ordinals: set[int] = set()
    for raw_phase in raw_phases:
        phase = _record(raw_phase, "movement_task.phase")
        phase_id = _text(phase.get("id"), "movement_task.phase.id")
        ordinal = phase.get("ordinal")
        if not isinstance(ordinal, int) or isinstance(ordinal, bool) or ordinal < 1:
            _fail(
                "PHASE_DEFINITION_MISSING", "MovementTask phase ordinals must be positive integers."
            )
        if phase_id in phases_by_id or ordinal in ordinals:
            _fail("PHASE_DEFINITION_MISSING", "MovementTask phase ids and ordinals must be unique.")
        phases_by_id[phase_id] = phase
        ordinals.add(ordinal)
    protocol = _record(payload.get("protocol"), "protocol")
    if protocol.get("kind") != "SEGMENTATION_PROTOCOL":
        _fail("PROTOCOL_INCOMPATIBLE", "A versioned SegmentationProtocolDefinition is required.")
    _identity(protocol, "protocol")
    if protocol.get("supported_task_class") != SUPPORTED_TASK_CLASS:
        _fail(
            "METHOD_NOT_APPLICABLE",
            "The SCI-3 v1 processor supports one-dimensional bidirectional implement motion only.",
        )
    protocol_task = _identity(protocol.get("movement_task"), "protocol.movement_task")
    if not _same_identity(protocol_task, task_identity):
        _fail("PROTOCOL_INCOMPATIBLE", "The protocol must bind the exact MovementTask identity.")
    if (
        protocol.get("filtering_policy") != "NONE_ONLY"
        or protocol.get("interpolation_policy") != "NONE_ONLY"
    ):
        _fail(
            "UNSUPPORTED_CONFIGURATION",
            "The protocol must explicitly forbid filtering and interpolation in SCI-3 v1.",
        )
    raw_sequence = protocol.get("expected_phase_sequence")
    if not isinstance(raw_sequence, list) or len(raw_sequence) != 2:
        _fail(
            "PROTOCOL_INCOMPATIBLE", "SCI-3 v1 requires exactly two ordered task phase references."
        )
    sequence: list[dict[str, Any]] = []
    polarities: set[str] = set()
    for raw_ref in raw_sequence:
        phase_ref = _record(raw_ref, "protocol.expected_phase_sequence")
        phase_id = _text(phase_ref.get("phase_id"), "protocol.phase_ref.phase_id")
        resolved_phase = phases_by_id.get(phase_id)
        if resolved_phase is None:
            _fail(
                "PHASE_DEFINITION_MISSING",
                "Every protocol phase reference must resolve in MovementTask.",
            )
        phase_task = _identity(phase_ref.get("movement_task"), "protocol.phase_ref.movement_task")
        if not _same_identity(phase_task, task_identity):
            _fail(
                "PROTOCOL_INCOMPATIBLE",
                "Every phase reference must bind the exact MovementTask identity.",
            )
        if phase_ref.get("phase_ordinal") != resolved_phase.get("ordinal") or phase_ref.get(
            "phase_action"
        ) != resolved_phase.get("action"):
            _fail(
                "PROTOCOL_INCOMPATIBLE",
                "Protocol phase references must retain the SCI-1 phase ordinal and action.",
            )
        polarity = phase_ref.get("polarity")
        if polarity not in {"POSITIVE", "NEGATIVE"}:
            _fail(
                "PROTOCOL_INCOMPATIBLE",
                "Every dynamic phase must declare POSITIVE or NEGATIVE polarity.",
            )
        if polarity in polarities:
            _fail(
                "PROTOCOL_INCOMPATIBLE",
                "The two v1 phase references must have opposite polarities.",
            )
        polarities.add(polarity)
        sequence.append(
            {
                "movement_task": task_identity,
                "phase_id": phase_id,
                "phase_ordinal": resolved_phase["ordinal"],
                "phase_action": resolved_phase["action"],
                "phase_label": resolved_phase.get("label"),
                "polarity": polarity,
            }
        )
    if (
        protocol.get("dwell_policy") != "ALLOWED"
        or protocol.get("boundary_policy") != "SAMPLED_ONLY_NO_INTERPOLATION"
    ):
        _fail("PROTOCOL_INCOMPATIBLE", "Dwell and sampled boundary policies must be explicit.")
    return task_identity, protocol, sequence


def _classify(velocities: list[float], configuration: dict[str, Any]) -> list[str]:
    enter = configuration["velocity_enter_threshold_mps"]
    exit_threshold = configuration["velocity_exit_threshold_mps"]
    previous = "DWELL"
    states: list[str] = []
    for velocity in velocities:
        if velocity >= enter:
            current = "POSITIVE"
        elif velocity <= -enter:
            current = "NEGATIVE"
        elif abs(velocity) <= exit_threshold:
            current = "DWELL"
        elif previous in {"POSITIVE", "NEGATIVE"}:
            current = previous
        else:
            current = "UNKNOWN"
        states.append(current)
        previous = current
    return states


def _runs(states: list[str]) -> list[Run]:
    if not states:
        return []
    output: list[Run] = []
    start = 0
    state = states[0]
    for index in range(1, len(states)):
        if states[index] == state:
            continue
        output.append(Run(state, start, index - 1))
        start = index
        state = states[index]
    output.append(Run(state, start, len(states) - 1))
    return output


def _boundary(
    samples: list[dict[str, Any]], index: int, event_type: str, step: float
) -> dict[str, Any]:
    sample = samples[index]
    return {
        "sample_index": index,
        "time_s": sample["time_s"],
        "event_type": event_type,
        "event_method": "SAMPLE_STATE_TRANSITION_NO_INTERPOLATION",
        "temporal_resolution_s": step,
    }


def _dwell_intervals(
    samples: list[dict[str, Any]],
    runs: list[Run],
    start: int,
    end: int,
    kind: str,
    step: float,
) -> list[dict[str, Any]]:
    if end < start:
        return []
    intervals: list[dict[str, Any]] = []
    for run in runs:
        if run.state != "DWELL" or run.end < start or run.start > end:
            continue
        interval_start = max(run.start, start)
        interval_end = min(run.end, end)
        intervals.append(
            {
                "kind": kind,
                "start": _boundary(samples, interval_start, "DWELL_START", step),
                "end": _boundary(samples, interval_end, "DWELL_END", step),
                "duration_s": samples[interval_end]["time_s"] - samples[interval_start]["time_s"],
            }
        )
    return intervals


def _phase(
    samples: list[dict[str, Any]],
    phase_ref: dict[str, Any],
    start: int,
    end: int,
    step: float,
    configuration: dict[str, Any],
) -> dict[str, Any]:
    duration = samples[end]["time_s"] - samples[start]["time_s"]
    displacement = samples[end]["position_m"] - samples[start]["position_m"]
    if not math.isfinite(displacement):
        _fail("NUMERICAL_OVERFLOW", "Phase displacement overflowed.")
    excursion = abs(displacement)
    if duration < configuration["minimum_phase_duration_s"]:
        _fail(
            "SEGMENTATION_AMBIGUOUS",
            "A detected phase is shorter than the declared minimum phase duration.",
            phase_id=phase_ref["phase_id"],
        )
    if excursion < configuration["minimum_excursion_m"]:
        _fail(
            "SEGMENTATION_AMBIGUOUS",
            "A detected phase is below the declared minimum excursion.",
            phase_id=phase_ref["phase_id"],
        )
    return {
        "phase_ref": phase_ref,
        "polarity": phase_ref["polarity"],
        "start": _boundary(samples, start, "PHASE_START_DIRECTIONAL_SAMPLE", step),
        "end": _boundary(samples, end, "PHASE_END_LAST_DIRECTIONAL_SAMPLE", step),
        "duration_s": duration,
        "excursion_m": excursion,
    }


def _segment(
    samples: list[dict[str, Any]],
    runs: list[Run],
    sequence: list[dict[str, Any]],
    step: float,
    configuration: dict[str, Any],
) -> list[dict[str, Any]]:
    minimum_run = configuration["minimum_sustained_samples"]
    first_polarity = sequence[0]["polarity"]
    second_polarity = sequence[1]["polarity"]
    first_non_dwell = next((index for index, run in enumerate(runs) if run.state != "DWELL"), None)
    if first_non_dwell is None:
        _fail("NO_VALID_REPETITION", "The trace contains no above-threshold directional movement.")
    assert first_non_dwell is not None
    first_run = runs[first_non_dwell]
    if first_run.state == "UNKNOWN":
        _fail(
            "SEGMENTATION_AMBIGUOUS",
            "The trace begins in a hysteresis band without a declared motion state.",
        )
    if first_run.state != first_polarity:
        _fail(
            "PARTIAL_REPETITION",
            "The trace begins in the second phase; the first repetition is partial.",
        )
    if first_run.length < minimum_run:
        _fail(
            "SEGMENTATION_AMBIGUOUS",
            "The first directional run is shorter than the sustained-sample rule.",
        )
    if first_run.start < configuration["minimum_preroll_samples"]:
        if first_run.start == 0:
            _fail(
                "PARTIAL_REPETITION",
                "The trace begins with directional motion and has no required pre-roll.",
            )
        _fail("INSUFFICIENT_SAMPLES", "The trace does not contain the required pre-roll samples.")
    for run in runs[:first_non_dwell]:
        if run.state != "DWELL":
            _fail(
                "PARTIAL_REPETITION",
                "Pre-roll contains directional motion and cannot be silently discarded.",
            )

    repetitions: list[dict[str, Any]] = []
    run_index = first_non_dwell
    ordinal = 1
    while True:
        first_run = runs[run_index]
        if first_run.state != first_polarity or first_run.length < minimum_run:
            _fail(
                "SEGMENTATION_AMBIGUOUS",
                "The next first-phase run is not sustained and unambiguous.",
            )
        last_first = first_run
        reversal_index: int | None = None
        cursor = run_index + 1
        while cursor < len(runs):
            run = runs[cursor]
            if run.state == "DWELL":
                cursor += 1
                continue
            if run.state == "UNKNOWN":
                _fail(
                    "SEGMENTATION_AMBIGUOUS",
                    "An unclassified hysteresis-band interval interrupts a phase.",
                )
            if run.state == first_polarity:
                if run.length < minimum_run:
                    _fail(
                        "SEGMENTATION_AMBIGUOUS",
                        "A short same-direction run cannot be silently merged.",
                    )
                last_first = run
                cursor += 1
                continue
            if run.state == second_polarity:
                if run.length < minimum_run:
                    _fail(
                        "SEGMENTATION_AMBIGUOUS",
                        "A short opposite-direction run is not a qualified reversal.",
                    )
                reversal_index = cursor
                break
            _fail("SEGMENTATION_AMBIGUOUS", "The trace contains an unsupported directional state.")
        if reversal_index is None:
            _fail("PARTIAL_REPETITION", "A first phase has no sustained second-phase reversal.")

        second_run = runs[reversal_index]
        last_second = second_run
        next_first_index: int | None = None
        cursor = reversal_index + 1
        while cursor < len(runs):
            run = runs[cursor]
            if run.state == "DWELL":
                cursor += 1
                continue
            if run.state == "UNKNOWN":
                _fail(
                    "SEGMENTATION_AMBIGUOUS",
                    "An unclassified hysteresis-band interval interrupts a phase.",
                )
            if run.state == second_polarity:
                if run.length < minimum_run:
                    _fail(
                        "SEGMENTATION_AMBIGUOUS",
                        "A short same-direction run cannot be silently merged.",
                    )
                last_second = run
                cursor += 1
                continue
            if run.state == first_polarity:
                if run.length < minimum_run:
                    _fail(
                        "SEGMENTATION_AMBIGUOUS",
                        "A short first-phase run cannot be silently discarded.",
                    )
                next_first_index = cursor
                break
            _fail("SEGMENTATION_AMBIGUOUS", "The trace contains an unsupported directional state.")

        phase_one = _phase(
            samples,
            sequence[0],
            first_run.start,
            last_first.end,
            step,
            configuration,
        )
        phase_two = _phase(
            samples,
            sequence[1],
            second_run.start,
            last_second.end,
            step,
            configuration,
        )
        rep_duration = samples[last_second.end]["time_s"] - samples[first_run.start]["time_s"]
        if rep_duration < configuration["minimum_repetition_duration_s"]:
            _fail(
                "SEGMENTATION_AMBIGUOUS",
                "A detected repetition is shorter than the declared minimum duration.",
            )
        between_phase_dwell = _dwell_intervals(
            samples,
            runs,
            last_first.end + 1,
            second_run.start - 1,
            "REVERSAL_PAUSE",
            step,
        )
        between_rep_dwell = _dwell_intervals(
            samples,
            runs,
            last_second.end + 1,
            (
                runs[next_first_index].start - 1
                if next_first_index is not None
                else len(samples) - 1
            ),
            "BETWEEN_REPETITIONS" if next_first_index is not None else "POST_ROLL",
            step,
        )
        if next_first_index is None:
            trailing_start = last_second.end + 1
            trailing_count = len(samples) - trailing_start
            if trailing_count < configuration["minimum_postroll_samples"]:
                _fail("INCOMPLETE_TRACE", "The final phase lacks the required post-roll samples.")
            if any(run.state != "DWELL" for run in runs if run.start >= trailing_start):
                _fail(
                    "PARTIAL_REPETITION",
                    "Directional motion after the final phase cannot be silently discarded.",
                )
        repetition = {
            "ordinal": ordinal,
            "complete": True,
            "start": _boundary(samples, first_run.start, "REPETITION_START_FIRST_PHASE", step),
            "end": _boundary(samples, last_second.end, "REPETITION_END_LAST_PHASE", step),
            "duration_s": rep_duration,
            "phases": [phase_one, phase_two],
            "dwell_intervals": [*between_phase_dwell, *between_rep_dwell],
        }
        repetitions.append(repetition)
        if next_first_index is None:
            break
        run_index = next_first_index
        ordinal += 1
    return repetitions


def process(payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        _fail("INPUT_INVALID", "The SCI-3 engine envelope must be an object.")
    samples, step, configuration = _validate_time_series(payload)
    measurement = _validate_measurement(payload)
    sci2_lineage = _validate_sci2_lineage(payload)
    movement_task, protocol, sequence = _validate_task_and_protocol(payload)
    states = _classify([sample["velocity_mps"] for sample in samples], configuration)
    runs = _runs(states)
    repetitions = _segment(samples, runs, sequence, step, configuration)
    return {
        "status": "SUCCEEDED",
        "processor": {"id": PROCESSOR_ID, "version": PROCESSOR_VERSION},
        "method": {"id": METHOD_ID, "version": METHOD_VERSION},
        "timebase": {
            "declared_step_s": step,
            "declared_sample_count": len(samples),
        },
        "state_runs": [
            {
                "state": run.state,
                "start_index": run.start,
                "end_index": run.end,
                "sample_count": run.length,
            }
            for run in runs
        ],
        "repetitions": repetitions,
        "measurement": measurement,
        "sci2_lineage": sci2_lineage,
        "movement_task": movement_task,
        "protocol": protocol,
        "configuration": configuration,
        "uncertainty": {
            "temporal_resolution_s": step,
            "sampling_resolution": "DECLARED_TIMEBASE_STEP_NOT_UNCERTAINTY",
            "boundary_localization": "SAMPLE_BOUNDARY_ONLY_NO_SUBSAMPLE_ESTIMATE",
            "reference_label_uncertainty": "NOT_PROVIDED",
            "algorithmic_timing_uncertainty": "NOT_ESTIMATED",
            "device_timing_uncertainty": "NOT_PROVIDED",
            "filter_phase_shift": "NOT_APPLICABLE_FILTERING_NONE",
            "acquisition_sensitivity": "NOT_PROVIDED",
            "measurement_point_uncertainty": "NOT_PROVIDED",
            "protocol_ambiguity": "DECLARED_BY_FAILURE_ON_UNKNOWN_OR_PARTIAL_STATES",
        },
        "diagnostics": {
            "valid_repetition_count": len(repetitions),
            "unknown_state_sample_count": states.count("UNKNOWN"),
            "performance_metrics": "NOT_COMPUTED",
        },
    }


def _main() -> int:
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw)
        result = process(payload)
    except EngineFailure as failure:
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
                "message": "The SCI-3 engine could not decode its transport envelope.",
                "details": [{"key": "error_type", "value": type(error).__name__}],
            },
        }
    except Exception as error:  # pragma: no cover - defensive process boundary
        result = {
            "status": "INFRASTRUCTURE_FAILED",
            "exception": {
                "code": "INFRASTRUCTURE_EXCEPTION",
                "message": "The SCI-3 engine failed outside the scientific input contract.",
                "details": [{"key": "error_type", "value": type(error).__name__}],
            },
        }
    sys.stdout.write(json.dumps(result, allow_nan=False, separators=(",", ":")))
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(_main())
