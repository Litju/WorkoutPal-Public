"""SCI-5 set-level descriptive velocity state numerical authority.

The processor consumes one already qualified SCI-4 velocity metric per ordered
repetition. It performs only direction normalization, explicit reference
selection, arithmetic velocity change/decline calculations, and caller-bound
threshold event detection. It does not infer fatigue, readiness, recovery,
termination, load changes, or any prescription.
"""

from __future__ import annotations

import hashlib
import json
import math
import sys
from typing import Any, NoReturn

PROCESSOR_ID = "resistance_training.set_velocity_state"
PROCESSOR_VERSION = "1.0.0"
METHOD_ID = "set_velocity_state.reference_normalized_decline"
METHOD_VERSION = "1.0.0"

SUPPORTED_METRIC_IDS = {
    "PHASE_INTERVAL_AVERAGE_SIGNED_LINEAR_VELOCITY",
    "PHASE_DIRECTION_PEAK_SAMPLED_LINEAR_VELOCITY",
}
SUPPORTED_METRIC_VERSION = "1.0.0"
SUPPORTED_METRIC_METHOD_ID = "rep_phase_metrics.sample_aligned_claim_binding"
SUPPORTED_METRIC_METHOD_VERSION = "1.0.0"
QUALIFICATION_STATUSES = {"QUALIFIED", "QUALIFIED_SOFTWARE", "UNPROVEN"}
REFERENCE_POLICIES = {
    "FIRST_ELIGIBLE",
    "FASTEST_ELIGIBLE_COMPLETE_SET",
    "FASTEST_SO_FAR",
    "EXPLICIT_REPETITION",
}
MODES = {"ONLINE_PREFIX", "POST_HOC_COMPLETE_SET"}
CONTEXT_FIELDS = (
    ("set_id", "SET_ID_MISMATCH"),
    ("assessment_id", "INPUT_INVALID"),
    ("trial_id", "INPUT_INVALID"),
    ("exercise_definition", "EXERCISE_DEFINITION_MISMATCH"),
    ("exercise_variation", "EXERCISE_VARIATION_MISMATCH"),
    ("movement_task", "MOVEMENT_TASK_MISMATCH"),
    ("load_configuration", "LOAD_CONFIGURATION_MISMATCH"),
    ("selected_phase", "REP_PHASE_MISMATCH"),
    ("metric_definition", "METRIC_DEFINITION_MISMATCH"),
    ("measurement", "MEASUREMENT_OBJECT_MISMATCH"),
)


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


def _finite(value: Any, label: str, code: str = "NON_FINITE_VELOCITY") -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        _fail(code, f"{label} must be numeric.")
    result = float(value)
    if not math.isfinite(result):
        _fail(code, f"{label} must be finite.")
    return result


def _integer(value: Any, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        _fail("INPUT_INVALID", f"{label} must be an integer.")
    return value


def _canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


def _digest(value: Any) -> str:
    return hashlib.sha256(_canonical(value).encode("utf-8")).hexdigest()[:24]


def _same(left: Any, right: Any) -> bool:
    return _canonical(left) == _canonical(right)


def _identity(value: Any, label: str) -> dict[str, Any]:
    identity = _record(value, label)
    _text(identity.get("id"), f"{label}.id")
    _text(identity.get("version"), f"{label}.version")
    revision = identity.get("revision")
    if revision is not None and (
        isinstance(revision, bool) or not isinstance(revision, int) or revision < 1
    ):
        _fail("INPUT_INVALID", f"{label}.revision must be a positive integer when supplied.")
    return identity


def _validate_measurement(value: Any) -> dict[str, Any]:
    measurement = _record(value, "set_context.measurement")
    for key in (
        "object_of_interest",
        "measurement_point",
        "reference_frame",
        "axis",
        "modality",
    ):
        if key not in measurement:
            _fail("REQUIRED_EVIDENCE_MISSING", f"set_context.measurement.{key} is required.")
        _record(measurement[key], f"set_context.measurement.{key}")
    return measurement


def _validate_context(context: Any) -> dict[str, Any]:
    value = _record(context, "set_context")
    for key, _ in CONTEXT_FIELDS:
        if key not in value:
            _fail("REQUIRED_EVIDENCE_MISSING", f"set_context.{key} is required.")
    _text(value.get("set_id"), "set_context.set_id")
    _text(value.get("assessment_id"), "set_context.assessment_id")
    _text(value.get("trial_id"), "set_context.trial_id")
    _identity(value.get("exercise_definition"), "set_context.exercise_definition")
    variation = value.get("exercise_variation")
    if variation is not None:
        _identity(variation, "set_context.exercise_variation")
    _identity(value.get("movement_task"), "set_context.movement_task")
    _identity(value.get("load_configuration"), "set_context.load_configuration")

    phase = _identity(value.get("selected_phase"), "set_context.selected_phase")
    phase_id = _text(phase.get("phase_id"), "set_context.selected_phase.phase_id")
    polarity = phase.get("polarity")
    if polarity not in {"POSITIVE", "NEGATIVE"}:
        _fail("REP_PHASE_MISMATCH", "The selected phase polarity must be POSITIVE or NEGATIVE.")
    phase["phase_id"] = phase_id

    metric = _record(value.get("metric_definition"), "set_context.metric_definition")
    metric_id = _text(metric.get("id"), "set_context.metric_definition.id")
    metric_version = _text(metric.get("version"), "set_context.metric_definition.version")
    if metric_id not in SUPPORTED_METRIC_IDS or metric_version != SUPPORTED_METRIC_VERSION:
        _fail(
            "METRIC_DEFINITION_MISMATCH",
            "SCI-5 accepts only the two SCI-4 phase velocity metric definitions.",
        )
    if metric.get("unit") != "m/s" or metric.get("dimension") != "speed":
        _fail("DIMENSION_MISMATCH", "The selected SCI-4 metric must be a velocity in m/s.")
    method = _identity(metric.get("method"), "set_context.metric_definition.method")
    if (
        method["id"] != SUPPORTED_METRIC_METHOD_ID
        or method["version"] != SUPPORTED_METRIC_METHOD_VERSION
    ):
        _fail(
            "METRIC_METHOD_MISMATCH",
            "The selected metric must retain the SCI-4 sample-aligned method identity.",
        )

    _validate_measurement(value.get("measurement"))
    qualifications = value.get("upstream_qualifications")
    if not isinstance(qualifications, list) or not qualifications:
        _fail(
            "UPSTREAM_QUALIFICATION_MISSING",
            "SCI-5 requires visible upstream SCI-2/SCI-3/SCI-4 qualification bindings.",
        )
    for index, raw_qualification in enumerate(qualifications):
        qualification = _record(raw_qualification, f"set_context.upstream_qualifications[{index}]")
        _text(qualification.get("capability_id"), f"upstream_qualifications[{index}].capability_id")
        _text(
            qualification.get("capability_version"),
            f"upstream_qualifications[{index}].capability_version",
        )
        status = qualification.get("qualification_status")
        if status not in QUALIFICATION_STATUSES:
            _fail(
                "UPSTREAM_QUALIFICATION_UNSUPPORTED",
                "SCI-5 received an unsupported upstream qualification state.",
                status=status,
            )
        artifact = _record(
            qualification.get("qualification_artifact"),
            f"upstream_qualifications[{index}].qualification_artifact",
        )
        _text(artifact.get("type"), f"upstream_qualifications[{index}].qualification_artifact.type")
        _text(artifact.get("ref"), f"upstream_qualifications[{index}].qualification_artifact.ref")
        limitations = qualification.get("limitations")
        if not isinstance(limitations, list):
            _fail("INPUT_INVALID", "Each upstream qualification must retain a limitations list.")
    return value


def _validate_thresholds(
    raw_thresholds: Any,
    context: dict[str, Any],
    mode: str,
    policy: str,
) -> list[dict[str, Any]]:
    if not isinstance(raw_thresholds, list):
        _fail(
            "THRESHOLD_INVALID", "Thresholds must be an explicit list; no default threshold exists."
        )
    thresholds: list[dict[str, Any]] = []
    ids: set[str] = set()
    for index, raw_threshold in enumerate(raw_thresholds):
        threshold = _record(raw_threshold, f"thresholds[{index}]")
        threshold_id = _text(threshold.get("id"), f"thresholds[{index}].id")
        if threshold_id in ids:
            _fail("THRESHOLD_INVALID", "Threshold ids must be unique.", threshold_id=threshold_id)
        ids.add(threshold_id)
        version = _text(threshold.get("version"), f"thresholds[{index}].version")
        unit = threshold.get("unit")
        if unit not in {"PERCENT", "RATIO"}:
            _fail("THRESHOLD_INVALID", "Threshold unit must be PERCENT or RATIO.")
        value = _finite(threshold.get("value"), f"thresholds[{index}].value", "THRESHOLD_INVALID")
        if value < 0:
            _fail("THRESHOLD_INVALID", "Velocity-decline thresholds cannot be negative.")
        metric_id = _text(threshold.get("metric_id"), f"thresholds[{index}].metric_id")
        metric_version = _text(
            threshold.get("metric_version"), f"thresholds[{index}].metric_version"
        )
        threshold_policy = _text(
            threshold.get("reference_policy"), f"thresholds[{index}].reference_policy"
        )
        threshold_mode = _text(threshold.get("mode"), f"thresholds[{index}].mode")
        if (
            metric_id != context["metric_definition"]["id"]
            or metric_version != context["metric_definition"]["version"]
            or threshold_policy != policy
            or threshold_mode != mode
        ):
            _fail(
                "THRESHOLD_BINDING_MISMATCH",
                "Each threshold must bind to the selected metric, reference policy, and evaluation mode.",
                threshold_id=threshold_id,
            )
        threshold_percent = value if unit == "PERCENT" else value * 100.0
        if not math.isfinite(threshold_percent):
            _fail("THRESHOLD_INVALID", "The normalized threshold must be finite.")
        thresholds.append(
            {
                "id": threshold_id,
                "version": version,
                "unit": unit,
                "value": value,
                "threshold_percent": threshold_percent,
                "metric_id": metric_id,
                "metric_version": metric_version,
                "reference_policy": threshold_policy,
                "mode": threshold_mode,
            }
        )
    return thresholds


def _compare_binding(context: dict[str, Any], bindings: Any) -> None:
    value = _record(bindings, "repetition.bindings")
    for key, code in CONTEXT_FIELDS:
        if key not in value:
            _fail("REQUIRED_EVIDENCE_MISSING", f"repetition.bindings.{key} is required.")
        if key == "measurement" and not _same(value.get(key), context.get(key)):
            measurement_codes = (
                ("object_of_interest", "MEASUREMENT_OBJECT_MISMATCH"),
                ("measurement_point", "MEASUREMENT_POINT_MISMATCH"),
                ("reference_frame", "REFERENCE_FRAME_MISMATCH"),
                ("axis", "AXIS_MISMATCH"),
                ("modality", "MODALITY_MISMATCH"),
            )
            expected_measurement = _record(context.get(key), "set_context.measurement")
            actual_measurement = _record(value.get(key), "repetition.bindings.measurement")
            for measurement_key, measurement_code in measurement_codes:
                if not _same(
                    actual_measurement.get(measurement_key),
                    expected_measurement.get(measurement_key),
                ):
                    _fail(
                        measurement_code,
                        f"Repetition measurement binding for {measurement_key} does not match the set-level binding.",
                        field=measurement_key,
                    )
        if not _same(value.get(key), context.get(key)):
            _fail(
                code,
                f"Repetition binding for {key} does not match the set-level binding.",
                field=key,
            )


def _excluded_record(rep: dict[str, Any], code: str, reason: str) -> dict[str, Any]:
    exclusion = rep.get("exclusion")
    if exclusion is not None:
        exclusion_record = _record(exclusion, "repetition.exclusion")
        declared_code = exclusion_record.get("code")
        declared_reason = exclusion_record.get("reason")
        if (
            not isinstance(declared_code, str)
            or not declared_code.strip()
            or not isinstance(declared_reason, str)
            or not declared_reason.strip()
        ):
            _fail(
                "EXPLICIT_EXCLUSION_REASON_MISSING",
                "Excluded repetitions must retain a structured code and reason.",
            )
        code = declared_code.strip()
        reason = declared_reason.strip()
    return {
        "rep_id": _text(rep.get("rep_id"), "repetition.rep_id"),
        "ordinal": _integer(rep.get("ordinal"), "repetition.ordinal"),
        "eligible": False,
        "exclusion_code": code,
        "exclusion_reason": reason,
    }


def _validate_repetitions(
    payload: dict[str, Any], context: dict[str, Any]
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    raw_repetitions = payload.get("repetitions")
    if not isinstance(raw_repetitions, list) or not raw_repetitions:
        _fail("SEQUENCE_EMPTY", "SCI-5 requires a non-empty chronological repetition sequence.")
    normalized: list[dict[str, Any]] = []
    excluded: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    previous_ordinal: int | None = None
    for index, raw_rep in enumerate(raw_repetitions):
        rep = _record(raw_rep, f"repetitions[{index}]")
        rep_id = _text(rep.get("rep_id"), f"repetitions[{index}].rep_id")
        if rep_id in seen_ids:
            _fail("DUPLICATE_REPETITION_ID", "Repetition identities must be unique.", rep_id=rep_id)
        seen_ids.add(rep_id)
        ordinal = _integer(rep.get("ordinal"), f"repetitions[{index}].ordinal")
        if ordinal < 1:
            _fail(
                "REPETITION_ORDINAL_INVALID", "Repetition ordinals must be positive.", rep_id=rep_id
            )
        if previous_ordinal is not None and ordinal <= previous_ordinal:
            _fail(
                "REPETITION_ORDER_INVALID",
                "Repetitions must remain in caller-provided chronological order; SCI-5 never sorts by velocity.",
            )
        previous_ordinal = ordinal
        complete = rep.get("complete")
        if not isinstance(complete, bool):
            _fail("INPUT_INVALID", "repetition.complete must be boolean.", rep_id=rep_id)
        explicitly_eligible = rep.get("eligible", True)
        if not isinstance(explicitly_eligible, bool):
            _fail("INPUT_INVALID", "repetition.eligible must be boolean.", rep_id=rep_id)
        if not explicitly_eligible:
            if rep.get("exclusion") is None:
                _fail(
                    "EXPLICIT_EXCLUSION_REASON_MISSING",
                    "A caller-excluded repetition must retain an explicit exclusion code and reason.",
                    rep_id=rep_id,
                )
            excluded_rep = _excluded_record(
                rep, "REP_METRIC_INVALID", "Caller excluded this repetition from SCI-5 eligibility."
            )
            normalized.append(
                {
                    "rep_id": rep_id,
                    "ordinal": ordinal,
                    "eligible": False,
                    "exclusion_code": excluded_rep["exclusion_code"],
                    "exclusion_reason": excluded_rep["exclusion_reason"],
                }
            )
            excluded.append(excluded_rep)
            continue
        if not complete:
            excluded_rep = _excluded_record(
                rep,
                "REP_INCOMPLETE",
                "The repetition does not contain the complete required SCI-4 phase.",
            )
            normalized.append(
                {
                    "rep_id": rep_id,
                    "ordinal": ordinal,
                    "eligible": False,
                    "exclusion_code": excluded_rep["exclusion_code"],
                    "exclusion_reason": excluded_rep["exclusion_reason"],
                }
            )
            excluded.append(excluded_rep)
            continue
        metric = rep.get("metric")
        if metric is None:
            excluded_rep = _excluded_record(
                rep, "REP_METRIC_MISSING", "The selected SCI-4 velocity metric is missing."
            )
            normalized.append(
                {
                    "rep_id": rep_id,
                    "ordinal": ordinal,
                    "eligible": False,
                    "exclusion_code": excluded_rep["exclusion_code"],
                    "exclusion_reason": excluded_rep["exclusion_reason"],
                }
            )
            excluded.append(excluded_rep)
            continue
        metric_record = _record(metric, f"repetitions[{index}].metric")
        validity = metric_record.get("validity", "VALID")
        if validity != "VALID":
            excluded_rep = _excluded_record(
                rep, "REP_UPSTREAM_INVALID", "The upstream SCI-4 metric is not marked VALID."
            )
            normalized.append(
                {
                    "rep_id": rep_id,
                    "ordinal": ordinal,
                    "eligible": False,
                    "exclusion_code": excluded_rep["exclusion_code"],
                    "exclusion_reason": excluded_rep["exclusion_reason"],
                }
            )
            excluded.append(excluded_rep)
            continue
        _compare_binding(context, rep.get("bindings"))
        metric_id = _text(metric_record.get("metric_id"), f"repetitions[{index}].metric.metric_id")
        metric_version = _text(
            metric_record.get("metric_version"), f"repetitions[{index}].metric.metric_version"
        )
        if (
            metric_id != context["metric_definition"]["id"]
            or metric_version != context["metric_definition"]["version"]
        ):
            _fail(
                "METRIC_DEFINITION_MISMATCH",
                "A repetition does not use the selected SCI-4 metric definition.",
                rep_id=rep_id,
            )
        method = _record(metric_record.get("method"), f"repetitions[{index}].metric.method")
        if (
            method.get("id") != SUPPORTED_METRIC_METHOD_ID
            or method.get("version") != SUPPORTED_METRIC_METHOD_VERSION
        ):
            _fail(
                "METRIC_METHOD_MISMATCH",
                "A repetition does not retain the selected SCI-4 method identity.",
                rep_id=rep_id,
            )
        qualification_status = metric_record.get("qualification_status")
        if qualification_status not in QUALIFICATION_STATUSES:
            _fail(
                "UPSTREAM_QUALIFICATION_UNSUPPORTED",
                "A repetition contains an unsupported SCI-4 qualification state.",
                rep_id=rep_id,
            )
        claim_id = _text(metric_record.get("claim_id"), f"repetitions[{index}].metric.claim_id")
        signed_velocity = _finite(
            metric_record.get("signed_velocity_mps"),
            f"repetitions[{index}].metric.signed_velocity_mps",
        )
        polarity = context["selected_phase"]["polarity"]
        directional_velocity = signed_velocity if polarity == "POSITIVE" else -signed_velocity
        if directional_velocity < 0:
            _fail(
                "AXIS_MISMATCH",
                "Direction normalization produced a velocity opposite to the declared phase direction; SCI-5 does not apply abs().",
                rep_id=rep_id,
            )
        normalized.append(
            {
                "rep_id": rep_id,
                "ordinal": ordinal,
                "eligible": True,
                "signed_velocity_mps": signed_velocity,
                "directional_velocity_mps": directional_velocity,
                "claim_id": claim_id,
                "qualification_status": qualification_status,
            }
        )
    if not any(rep["eligible"] for rep in normalized):
        _fail(
            "SEQUENCE_EMPTY",
            "SCI-5 has no eligible complete repetitions after explicit exclusions.",
        )
    return normalized, excluded


def _select_reference(
    eligible: list[dict[str, Any]],
    policy: str,
    explicit_reference_rep_id: str | None,
) -> dict[str, Any]:
    if policy == "FIRST_ELIGIBLE":
        return eligible[0]
    if policy in {"FASTEST_ELIGIBLE_COMPLETE_SET", "FASTEST_SO_FAR"}:
        # Python's max is stable for equal values, preserving the earliest
        # chronological repetition as the declared tie policy.
        return max(eligible, key=lambda rep: rep["directional_velocity_mps"])
    if policy == "EXPLICIT_REPETITION":
        if explicit_reference_rep_id is None:
            _fail(
                "REFERENCE_REPETITION_NOT_FOUND",
                "EXPLICIT_REPETITION requires an explicit observed repetition id.",
            )
        for rep in eligible:
            if rep["rep_id"] == explicit_reference_rep_id:
                return rep
        _fail(
            "REFERENCE_REPETITION_NOT_FOUND",
            "The explicit reference repetition is not eligible in this observed prefix.",
            reference_rep_id=explicit_reference_rep_id,
        )
    _fail("REFERENCE_POLICY_INVALID", "Unsupported reference policy.", policy=policy)


def _threshold_events(
    repetitions: list[dict[str, Any]],
    thresholds: list[dict[str, Any]],
    reference_rep_id: str,
    reference_velocity: float,
    prefix_index: int,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    events: list[dict[str, Any]] = []
    first_crossings: list[dict[str, Any]] = []
    for threshold in thresholds:
        first_rep_id: str | None = None
        first_ordinal: int | None = None
        for rep in repetitions:
            decline_percent = float(rep["velocity_decline_percent"])
            threshold_percent = float(threshold["threshold_percent"])
            machine_boundary = 4.0 * max(
                math.ulp(max(abs(decline_percent), 1.0)),
                math.ulp(max(abs(threshold_percent), 1.0)),
            )
            crossed = decline_percent > threshold_percent or (
                decline_percent >= threshold_percent - machine_boundary
                and decline_percent <= threshold_percent + machine_boundary
            )
            event = {
                "threshold_id": threshold["id"],
                "threshold_version": threshold["version"],
                "threshold_unit": threshold["unit"],
                "threshold_value": threshold["value"],
                "threshold_percent": threshold["threshold_percent"],
                "metric_id": threshold["metric_id"],
                "metric_version": threshold["metric_version"],
                "reference_policy": threshold["reference_policy"],
                "mode": threshold["mode"],
                "reference_rep_id": reference_rep_id,
                "reference_velocity_mps": reference_velocity,
                "rep_id": rep["rep_id"],
                "rep_ordinal": rep["ordinal"],
                "current_velocity_mps": rep["directional_velocity_mps"],
                "velocity_decline_mps": rep["velocity_decline_mps"],
                "velocity_decline": rep["velocity_decline"],
                "velocity_decline_percent": decline_percent,
                "evaluation_snapshot_prefix_index": prefix_index,
                "crossed": crossed,
            }
            events.append(event)
            if crossed and first_rep_id is None:
                first_rep_id = rep["rep_id"]
                first_ordinal = rep["ordinal"]
        first_crossings.append(
            {
                "threshold_id": threshold["id"],
                "threshold_version": threshold["version"],
                "threshold_percent": threshold["threshold_percent"],
                "metric_id": threshold["metric_id"],
                "metric_version": threshold["metric_version"],
                "reference_policy": threshold["reference_policy"],
                "mode": threshold["mode"],
                "evaluation_snapshot_prefix_index": prefix_index,
                "first_crossing_rep_id": first_rep_id,
                "first_crossing_ordinal": first_ordinal,
            }
        )
    return events, first_crossings


def _build_snapshot(
    prefix: list[dict[str, Any]],
    excluded: list[dict[str, Any]],
    context: dict[str, Any],
    policy: str,
    mode: str,
    explicit_reference_rep_id: str | None,
    thresholds: list[dict[str, Any]],
    prefix_index: int,
) -> dict[str, Any]:
    eligible = [rep for rep in prefix if rep["eligible"]]
    if not eligible:
        _fail(
            "SEQUENCE_EMPTY",
            "The observed prefix has no eligible repetitions.",
            prefix_index=prefix_index,
        )
    reference = _select_reference(eligible, policy, explicit_reference_rep_id)
    reference_velocity = float(reference["directional_velocity_mps"])
    if reference_velocity <= 0:
        _fail(
            "REFERENCE_VELOCITY_INVALID",
            "Reference-relative velocity state is undefined when the selected reference velocity is not positive.",
            reference_rep_id=reference["rep_id"],
        )
    state_repetitions: list[dict[str, Any]] = []
    for rep in eligible:
        directional = float(rep["directional_velocity_mps"])
        absolute_change = directional - reference_velocity
        decline_mps = reference_velocity - directional
        relative_change = absolute_change / reference_velocity
        relative_change_percent = relative_change * 100.0
        decline = decline_mps / reference_velocity
        decline_percent = decline * 100.0
        ratio = directional / reference_velocity
        for label, derived in (
            ("absolute_velocity_change_mps", absolute_change),
            ("relative_velocity_change", relative_change),
            ("relative_velocity_change_percent", relative_change_percent),
            ("velocity_decline_mps", decline_mps),
            ("velocity_decline", decline),
            ("velocity_decline_percent", decline_percent),
            ("velocity_ratio", ratio),
        ):
            if not math.isfinite(derived):
                _fail(
                    "RELATIVE_CHANGE_UNDEFINED",
                    "SCI-5 derived relative state is non-finite for the selected reference velocity.",
                    rep_id=rep["rep_id"],
                    field=label,
                )
        state_repetitions.append(
            {
                "rep_id": rep["rep_id"],
                "ordinal": rep["ordinal"],
                "claim_id": rep["claim_id"],
                "qualification_status": rep["qualification_status"],
                "raw_signed_velocity_mps": rep["signed_velocity_mps"],
                "directional_velocity_mps": directional,
                "absolute_velocity_change_mps": absolute_change,
                "velocity_decline_mps": decline_mps,
                "relative_velocity_change": relative_change,
                "relative_velocity_change_percent": relative_change_percent,
                "velocity_decline": decline,
                "velocity_decline_percent": decline_percent,
                "velocity_ratio": ratio,
                "velocity_maintenance_percent": ratio * 100.0,
            }
        )
    events, first_crossings = _threshold_events(
        state_repetitions,
        thresholds,
        reference["rep_id"],
        reference_velocity,
        prefix_index,
    )
    slowest = min(state_repetitions, key=lambda rep: rep["directional_velocity_mps"])
    final_rep = state_repetitions[-1]
    mean_velocity = sum(rep["directional_velocity_mps"] for rep in state_repetitions) / len(
        state_repetitions
    )
    mean_maintenance = mean_velocity / reference_velocity * 100.0
    if not math.isfinite(mean_velocity) or not math.isfinite(mean_maintenance):
        _fail(
            "RELATIVE_CHANGE_UNDEFINED",
            "SCI-5 set mean state is non-finite for the selected reference velocity.",
        )
    core = {
        "prefix_index": prefix_index,
        "prefix_rep_count": len(prefix),
        "observed_rep_ids": [rep["rep_id"] for rep in prefix],
        "eligible_rep_ids": [rep["rep_id"] for rep in eligible],
        "excluded_repetitions": [
            rep for rep in excluded if rep["rep_id"] in {item["rep_id"] for item in prefix}
        ],
        "mode": mode,
        "reference_policy": policy,
        "explicit_reference_rep_id": explicit_reference_rep_id,
        "reference_rep_id": reference["rep_id"],
        "reference_velocity_mps": reference_velocity,
        "metric_definition": context["metric_definition"],
        "selected_phase": context["selected_phase"],
        "repetitions": state_repetitions,
        "summaries": {
            "final_rep_id": final_rep["rep_id"],
            "final_rep_velocity_decline_percent": final_rep["velocity_decline_percent"],
            "slowest_rep_id": slowest["rep_id"],
            "slowest_rep_velocity_decline_percent": slowest["velocity_decline_percent"],
            "set_mean_velocity_mps": mean_velocity,
            "set_mean_velocity_maintenance_percent": mean_maintenance,
            "set_mean_velocity_decline_percent": 100.0 - mean_maintenance,
        },
        "threshold_events": events,
        "first_crossings": first_crossings,
    }
    snapshot = dict(core)
    snapshot["snapshot_id"] = f"sci5-snapshot-{_digest(core)}"
    return snapshot


def process(payload: dict[str, Any]) -> dict[str, Any]:
    context = _validate_context(payload.get("set_context"))
    mode = payload.get("mode")
    policy = payload.get("reference_policy")
    if mode not in MODES:
        _fail(
            "REFERENCE_POLICY_INVALID", "SCI-5 mode must be ONLINE_PREFIX or POST_HOC_COMPLETE_SET."
        )
    if policy not in REFERENCE_POLICIES:
        _fail("REFERENCE_POLICY_INVALID", "SCI-5 reference policy is not supported.", policy=policy)
    if mode == "ONLINE_PREFIX" and policy == "FASTEST_ELIGIBLE_COMPLETE_SET":
        _fail(
            "REFERENCE_POLICY_INCOMPATIBLE_WITH_MODE",
            "FASTEST_ELIGIBLE_COMPLETE_SET is non-causal and is unavailable in ONLINE_PREFIX mode.",
        )
    if mode == "POST_HOC_COMPLETE_SET" and policy == "FASTEST_SO_FAR":
        _fail(
            "REFERENCE_POLICY_INCOMPATIBLE_WITH_MODE",
            "FASTEST_SO_FAR is an online policy and is unavailable in POST_HOC_COMPLETE_SET mode.",
        )
    explicit_reference_rep_id = payload.get("explicit_reference_rep_id")
    if policy == "EXPLICIT_REPETITION":
        explicit_reference_rep_id = _text(explicit_reference_rep_id, "explicit_reference_rep_id")
    elif explicit_reference_rep_id is not None:
        _fail(
            "REFERENCE_POLICY_INVALID",
            "An explicit reference id is allowed only with EXPLICIT_REPETITION.",
        )
    thresholds = _validate_thresholds(payload.get("thresholds"), context, mode, policy)
    repetitions, excluded = _validate_repetitions(payload, context)

    if mode == "ONLINE_PREFIX":
        first_snapshot_prefix = 1
        if policy == "EXPLICIT_REPETITION":
            eligible_ids = {rep["rep_id"] for rep in repetitions if rep["eligible"]}
            if explicit_reference_rep_id not in eligible_ids:
                _fail(
                    "REFERENCE_REPETITION_NOT_FOUND",
                    "The explicit reference repetition must be present and eligible in the observed prefix.",
                    reference_rep_id=explicit_reference_rep_id,
                )
            explicit_index = next(
                index
                for index, rep in enumerate(repetitions)
                if rep["rep_id"] == explicit_reference_rep_id
            )
            # No state is emitted for a prefix that predates an explicit
            # reference. The first available immutable snapshot is the
            # prefix in which the caller's reference has been observed.
            first_snapshot_prefix = explicit_index + 1
        snapshots = [
            _build_snapshot(
                repetitions[:prefix_end],
                excluded,
                context,
                policy,
                mode,
                explicit_reference_rep_id,
                thresholds,
                prefix_end,
            )
            for prefix_end in range(first_snapshot_prefix, len(repetitions) + 1)
        ]
    else:
        snapshots = [
            _build_snapshot(
                repetitions,
                excluded,
                context,
                policy,
                mode,
                explicit_reference_rep_id,
                thresholds,
                len(repetitions),
            )
        ]
    return {
        "status": "SUCCEEDED",
        "processor": {"id": PROCESSOR_ID, "version": PROCESSOR_VERSION},
        "method": {"id": METHOD_ID, "version": METHOD_VERSION},
        "snapshots": snapshots,
        "uncertainty": {
            "status": "UNKNOWN",
            "statement": "SCI-5 v1 has no defensible measurement, sampling, device, or empirical uncertainty propagation model.",
            "components": {
                "upstream_sci2_sci3_sci4": "UNKNOWN_OR_INHERITED",
                "set_state_arithmetic": "EXACT_GIVEN_INPUTS",
                "measurement_and_device": "UNKNOWN",
                "empirical_qualification": "PENDING_OR_UNPROVEN",
            },
        },
        "diagnostics": {
            "input_rep_order": "PRESERVED_CHRONOLOGICAL_ORDER",
            "tie_policy": "EARLIEST_ELIGIBLE_REPETITION",
            "direction_normalization": "phase_polarity * signed_velocity",
            "absolute_velocity_change_definition": "current_directional_velocity - reference_directional_velocity; positive means faster and negative means slower",
            "relative_velocity_change_definition": "(current_directional_velocity - reference_directional_velocity) / reference_directional_velocity",
            "velocity_decline_definition": "(reference_directional_velocity - current_directional_velocity) / reference_directional_velocity",
            "threshold_comparison": "velocity_decline_percent >= caller_threshold_percent; equality crosses with only a floating-point ULP boundary",
            "no_abs_normalization": True,
            "no_clamping": True,
            "no_termination_action": True,
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
        payload = _record(raw_payload, "SCI-5 engine payload")
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
    sys.stdout.write(json.dumps(response, separators=(",", ":"), allow_nan=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
