"""SCI-6 load--velocity profile numerical authority.

The processor fits an observed-domain relationship between explicit external
mass and already-qualified directional SCI-4 rep velocity.  It deliberately
does not estimate 1RM, MVT, a maximum load, fatigue, readiness, recovery, or
any prescription.  The only prediction operation is forward interpolation at
an external mass inside the observed load domain.
"""

from __future__ import annotations

import json
import math
import sys
from typing import Any, NoReturn

PROCESSOR_ID = "resistance_training.load_velocity_profile"
PROCESSOR_VERSION = "1.0.0"
METHODS = {
    "TWO_POINT": (
        "load_velocity_profile.two_point_exact_linear",
        "1.0.0",
    ),
    "MULTI_POINT_OLS": (
        "load_velocity_profile.multi_point_ols_linear",
        "1.0.0",
    ),
}
PREDICTION_METHOD = {
    "id": "load_velocity_profile.observed_domain_interpolation",
    "version": "1.0.0",
}
SUPPORTED_METRIC_IDS = {
    "PHASE_INTERVAL_AVERAGE_SIGNED_LINEAR_VELOCITY",
    "PHASE_DIRECTION_PEAK_SAMPLED_LINEAR_VELOCITY",
}
SUPPORTED_METRIC_VERSION = "1.0.0"
SUPPORTED_METRIC_METHOD = {
    "id": "rep_phase_metrics.sample_aligned_claim_binding",
    "version": "1.0.0",
}
QUALIFICATION_STATUSES = {"QUALIFIED", "QUALIFIED_SOFTWARE"}
SCI4_METRIC_CAPABILITY_ID = "resistance_training.rep_phase_kinematic_metrics"
SCI4_METRIC_CAPABILITY_VERSION = "1.0.0"
SCI4_QUALIFICATION_ARTIFACT_TYPE = "SCI4_QUALIFICATION"
SELECTION_AUTHORITIES = {
    "EXPLICIT_REP_METRIC",
    "SCI5_FIRST_ELIGIBLE",
    "SCI5_FASTEST_ELIGIBLE_COMPLETE_SET",
    "SCI5_EXPLICIT_REPETITION",
}
MASS_FACTORS_TO_KG = {
    "kg": 1.0,
    "g": 0.001,
    "mg": 0.000001,
    "lb": 0.45359237,
    "oz": 0.028349523125,
}


class EngineFailure(Exception):
    """A deterministic, user-actionable scientific validation failure."""

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


def _finite(value: Any, label: str, code: str = "NON_FINITE_SAMPLE") -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        _fail(code, f"{label} must be numeric.")
    result = float(value)
    if not math.isfinite(result):
        _fail(code, f"{label} must be finite.")
    return result


def _positive(value: Any, label: str, code: str = "INPUT_INVALID") -> float:
    result = _finite(value, label, code)
    if result <= 0:
        _fail(code, f"{label} must be greater than zero.")
    return result


def _integer(value: Any, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        _fail("INPUT_INVALID", f"{label} must be an integer.")
    return value


def _canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


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
    measurement = _record(value, "profile_context.measurement")
    for key in (
        "object_of_interest",
        "measurement_point",
        "reference_frame",
        "axis",
        "modality",
    ):
        if key not in measurement:
            _fail("REQUIRED_EVIDENCE_MISSING", f"profile_context.measurement.{key} is required.")
        _record(measurement[key], f"profile_context.measurement.{key}")
    object_of_interest = measurement["object_of_interest"]
    measurement_point = measurement["measurement_point"]
    reference_frame = measurement["reference_frame"]
    axis = measurement["axis"]
    modality = measurement["modality"]
    _text(
        object_of_interest.get("object_kind"),
        "profile_context.measurement.object_of_interest.object_kind",
    )
    _text(
        object_of_interest.get("object_id"),
        "profile_context.measurement.object_of_interest.object_id",
    )
    if (
        _text(
            measurement_point.get("object_kind"),
            "profile_context.measurement.measurement_point.object_kind",
        )
        != "MEASUREMENT_POINT"
    ):
        _fail(
            "MEASUREMENT_POINT_MISMATCH",
            "The measurement point must use MEASUREMENT_POINT identity.",
        )
    _text(
        measurement_point.get("object_id"),
        "profile_context.measurement.measurement_point.object_id",
    )
    _text(
        reference_frame.get("frame_kind"), "profile_context.measurement.reference_frame.frame_kind"
    )
    frame_id = _text(
        reference_frame.get("frame_id"), "profile_context.measurement.reference_frame.frame_id"
    )
    _text(axis.get("axis"), "profile_context.measurement.axis.axis")
    _text(axis.get("sense"), "profile_context.measurement.axis.sense")
    if _text(axis.get("frame_id"), "profile_context.measurement.axis.frame_id") != frame_id:
        _fail("AXIS_BINDING_MISSING", "The measurement axis frame must match the reference frame.")
    _text(modality.get("modality_id"), "profile_context.measurement.modality.modality_id")
    _text(modality.get("version"), "profile_context.measurement.modality.version")
    _text(modality.get("kind"), "profile_context.measurement.modality.kind")
    return measurement


def _validate_metric_definition(value: Any) -> dict[str, Any]:
    metric = _record(value, "profile_context.metric_definition")
    metric_id = _text(metric.get("id"), "profile_context.metric_definition.id")
    if metric_id not in SUPPORTED_METRIC_IDS:
        _fail(
            "METRIC_DEFINITION_MISMATCH", "SCI-6 accepts only the two SCI-4 phase velocity metrics."
        )
    if (
        _text(metric.get("version"), "profile_context.metric_definition.version")
        != SUPPORTED_METRIC_VERSION
    ):
        _fail("METRIC_DEFINITION_MISMATCH", "The SCI-4 metric version is unsupported.")
    if metric.get("unit") != "m/s" or metric.get("dimension") != "speed":
        _fail("DIMENSION_MISMATCH", "The SCI-4 response metric must be expressed in m/s.")
    method = _identity(metric.get("method"), "profile_context.metric_definition.method")
    if (
        method.get("id") != SUPPORTED_METRIC_METHOD["id"]
        or method.get("version") != SUPPORTED_METRIC_METHOD["version"]
    ):
        _fail(
            "METRIC_METHOD_MISMATCH",
            "The SCI-4 metric must retain its sample-aligned method identity.",
        )
    return metric


def _validate_phase(value: Any) -> dict[str, Any]:
    phase = _identity(value, "profile_context.selected_phase")
    _text(phase.get("phase_id"), "profile_context.selected_phase.phase_id")
    if phase.get("polarity") not in {"POSITIVE", "NEGATIVE"}:
        _fail("REP_PHASE_MISMATCH", "The selected phase polarity must be POSITIVE or NEGATIVE.")
    return phase


def _validate_qualification(value: Any, label: str) -> dict[str, Any]:
    qualification = _record(value, label)
    _text(qualification.get("capability_id"), f"{label}.capability_id")
    _text(qualification.get("capability_version"), f"{label}.capability_version")
    if qualification.get("qualification_status") not in QUALIFICATION_STATUSES:
        _fail(
            "UPSTREAM_QUALIFICATION_UNSUPPORTED",
            f"{label} has an unsupported qualification status.",
        )
    artifact = _record(
        qualification.get("qualification_artifact"), f"{label}.qualification_artifact"
    )
    _text(artifact.get("type"), f"{label}.qualification_artifact.type")
    _text(artifact.get("ref"), f"{label}.qualification_artifact.ref")
    limitations = qualification.get("limitations")
    if (
        not isinstance(limitations, list)
        or not limitations
        or any(not isinstance(item, str) or not item.strip() for item in limitations)
    ):
        _fail(
            "UPSTREAM_QUALIFICATION_MISSING",
            f"{label}.limitations must be an explicit string list.",
        )
    return qualification


def _validate_load_configuration(value: Any, label: str) -> dict[str, Any]:
    configuration = _record(value, label)
    if configuration.get("kind") != "LOAD_CONFIGURATION":
        _fail("LOAD_CONFIGURATION_MISMATCH", f"{label}.kind must be LOAD_CONFIGURATION.")
    _identity(configuration, label)
    for key in (
        "interaction",
        "load_object",
        "placement",
        "distribution",
        "profile",
        "mechanical_feedback",
        "rationale",
    ):
        if key not in configuration:
            _fail("REQUIRED_EVIDENCE_MISSING", f"{label}.{key} is required.")
    _text(configuration.get("interaction"), f"{label}.interaction")
    load_object = _record(configuration.get("load_object"), f"{label}.load_object")
    _text(
        load_object.get("object_kind", load_object.get("objectKind")),
        f"{label}.load_object.object_kind",
    )
    _text(
        load_object.get("object_id", load_object.get("objectId")), f"{label}.load_object.object_id"
    )
    placement = _record(configuration.get("placement"), f"{label}.placement")
    _text(placement.get("kind"), f"{label}.placement.kind")
    contact_objects = placement.get("contact_objects", placement.get("contactObjects"))
    if not isinstance(contact_objects, list):
        _fail("REQUIRED_EVIDENCE_MISSING", f"{label}.placement.contact_objects must be a list.")
    for contact_index, contact_object in enumerate(contact_objects):
        contact = _record(contact_object, f"{label}.placement.contact_objects[{contact_index}]")
        _text(
            contact.get("object_kind", contact.get("objectKind")),
            f"{label}.placement.contact_objects[{contact_index}].object_kind",
        )
        _text(
            contact.get("object_id", contact.get("objectId")),
            f"{label}.placement.contact_objects[{contact_index}].object_id",
        )
    _text(configuration.get("distribution"), f"{label}.distribution")
    _text(configuration.get("profile"), f"{label}.profile")
    mechanical_feedback = _record(
        configuration.get("mechanical_feedback"), f"{label}.mechanical_feedback"
    )
    _text(mechanical_feedback.get("kind"), f"{label}.mechanical_feedback.kind")
    _text(mechanical_feedback.get("description"), f"{label}.mechanical_feedback.description")
    _text(configuration.get("rationale"), f"{label}.rationale")
    resistance = _record(configuration.get("resistance"), f"{label}.resistance")
    if resistance.get("kind") != "MASS":
        _fail(
            "DIMENSION_MISMATCH", "SCI-6 requires an explicit external mass resistance descriptor."
        )
    quantity = resistance.get("quantity")
    if quantity is None:
        _fail(
            "LOAD_CONFIGURATION_MISMATCH",
            f"{label}.resistance.quantity must be an explicit external mass quantity.",
        )
    q = _record(quantity, f"{label}.resistance.quantity")
    if q.get("dimension") != "mass":
        _fail("DIMENSION_MISMATCH", f"{label}.resistance.quantity must have mass dimension.")
    unit = _text(q.get("unit"), f"{label}.resistance.quantity.unit")
    if unit not in MASS_FACTORS_TO_KG:
        _fail("DIMENSION_MISMATCH", f"Unsupported mass unit in {label}.resistance.quantity.")
    _finite(q.get("value"), f"{label}.resistance.quantity.value", "NON_FINITE_SAMPLE")
    return configuration


def _load_mechanism_fingerprint(configuration: dict[str, Any]) -> str:
    copy = json.loads(_canonical(configuration))
    resistance = copy.get("resistance")
    if isinstance(resistance, dict):
        resistance["quantity"] = None
    return _canonical(copy)


def _mass_quantity_to_kg(value: Any, label: str) -> float:
    quantity = _record(value, label)
    if quantity.get("dimension") != "mass":
        _fail("DIMENSION_MISMATCH", f"{label} must have mass dimension.")
    unit = _text(quantity.get("unit"), f"{label}.unit")
    factor = MASS_FACTORS_TO_KG.get(unit)
    if factor is None:
        _fail("DIMENSION_MISMATCH", f"Unsupported mass unit in {label}.")
    return _positive(
        _finite(quantity.get("value"), f"{label}.value", "NON_FINITE_SAMPLE") * factor, label
    )


def _validate_profile(
    payload: dict[str, Any],
) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
    context = _record(payload.get("profile_context"), "profile_context")
    for key in (
        "profile_id",
        "athlete_id",
        "session_id",
        "assessment_id",
        "trial_id",
        "exercise_definition",
        "exercise_variation",
        "movement_task",
        "selected_phase",
        "metric_definition",
        "measurement",
    ):
        if key not in context:
            _fail("REQUIRED_EVIDENCE_MISSING", f"profile_context.{key} is required.")
    _text(context.get("profile_id"), "profile_context.profile_id")
    _text(context.get("athlete_id"), "profile_context.athlete_id")
    _text(context.get("session_id"), "profile_context.session_id")
    _text(context.get("assessment_id"), "profile_context.assessment_id")
    _text(context.get("trial_id"), "profile_context.trial_id")
    _identity(context.get("exercise_definition"), "profile_context.exercise_definition")
    variation = context.get("exercise_variation")
    if variation is not None:
        _identity(variation, "profile_context.exercise_variation")
    _identity(context.get("movement_task"), "profile_context.movement_task")
    phase = _validate_phase(context.get("selected_phase"))
    metric = _validate_metric_definition(context.get("metric_definition"))
    _validate_measurement(context.get("measurement"))

    raw_qualifications = payload.get("upstream_qualifications")
    if not isinstance(raw_qualifications, list) or not raw_qualifications:
        _fail("UPSTREAM_QUALIFICATION_MISSING", "SCI-6 requires visible upstream qualifications.")
    qualifications = [
        _validate_qualification(item, f"upstream_qualifications[{index}]")
        for index, item in enumerate(raw_qualifications)
    ]
    if not any(
        qualification.get("capability_id") == SCI4_METRIC_CAPABILITY_ID
        and qualification.get("capability_version") == SCI4_METRIC_CAPABILITY_VERSION
        and qualification.get("qualification_artifact", {}).get("type")
        == SCI4_QUALIFICATION_ARTIFACT_TYPE
        for qualification in qualifications
    ):
        _fail(
            "UPSTREAM_QUALIFICATION_MISSING",
            "SCI-6 requires a qualified SCI-4 rep-phase metric artifact.",
        )

    raw_observations = payload.get("observations")
    if not isinstance(raw_observations, list) or not raw_observations:
        _fail("SEQUENCE_EMPTY", "SCI-6 requires at least one observed load--velocity point.")
    observations: list[dict[str, Any]] = []
    observation_ids: set[str] = set()
    rep_ids: set[str] = set()
    load_values: list[float] = []
    mechanism_fingerprint: str | None = None
    polarity = phase["polarity"]
    metric_id = metric["id"]
    for index, raw_observation in enumerate(raw_observations):
        observation = _record(raw_observation, f"observations[{index}]")
        observation_id = _text(
            observation.get("observation_id"), f"observations[{index}].observation_id"
        )
        rep_id = _text(observation.get("rep_id"), f"observations[{index}].rep_id")
        if observation_id in observation_ids:
            _fail(
                "DUPLICATE_REPETITION_ID",
                "Observation identities must be unique.",
                observation_id=observation_id,
            )
        if rep_id in rep_ids:
            _fail("DUPLICATE_REPETITION_ID", "Repetition identities must be unique.", rep_id=rep_id)
        observation_ids.add(observation_id)
        rep_ids.add(rep_id)
        ordinal = _integer(observation.get("ordinal"), f"observations[{index}].ordinal")
        if ordinal < 1:
            _fail("REPETITION_ORDINAL_INVALID", "Observation ordinal must be positive.")
        if observation.get("complete") is not True:
            _fail("REP_INCOMPLETE", "SCI-6 accepts complete SCI-4 rep observations only.")

        load_kg = _mass_quantity_to_kg(
            observation.get("external_load"), f"observations[{index}].external_load"
        )
        configuration = _validate_load_configuration(
            observation.get("load_configuration"),
            f"observations[{index}].load_configuration",
        )
        config_quantity = configuration["resistance"].get("quantity")
        if config_quantity is not None:
            declared_kg = _mass_quantity_to_kg(
                config_quantity, f"observations[{index}].load_configuration.resistance.quantity"
            )
            if not math.isclose(declared_kg, load_kg, rel_tol=1e-10, abs_tol=1e-12):
                _fail(
                    "LOAD_CONFIGURATION_MISMATCH",
                    "External load magnitude must match the SCI-1 mass descriptor.",
                    observation_id=observation_id,
                )
        fingerprint = _load_mechanism_fingerprint(configuration)
        if mechanism_fingerprint is None:
            mechanism_fingerprint = fingerprint
        elif fingerprint != mechanism_fingerprint:
            _fail(
                "LOAD_CONFIGURATION_MISMATCH",
                "All observations must share one SCI-1 load mechanism and vary only in external mass magnitude.",
                observation_id=observation_id,
            )

        metric_binding = _record(observation.get("metric"), f"observations[{index}].metric")
        if metric_binding.get("metric_id") != metric_id or metric_binding.get(
            "metric_version"
        ) != metric.get("version"):
            _fail(
                "METRIC_DEFINITION_MISMATCH",
                "Each observation must bind the profile metric definition exactly.",
                observation_id=observation_id,
            )
        method = _identity(metric_binding.get("method"), f"observations[{index}].metric.method")
        if method != metric.get("method"):
            _fail(
                "METRIC_METHOD_MISMATCH",
                "Each observation must retain the SCI-4 metric method identity.",
                observation_id=observation_id,
            )
        if metric_binding.get("qualification_status") not in QUALIFICATION_STATUSES:
            _fail(
                "REP_UPSTREAM_INVALID",
                "Each observation must retain a visible SCI-4 qualification status.",
                observation_id=observation_id,
            )
        if metric_binding.get("validity", "VALID") != "VALID":
            _fail(
                "REP_METRIC_INVALID",
                "SCI-6 accepts valid SCI-4 metric claims only.",
                observation_id=observation_id,
            )
        if metric_binding.get("claim_class") != "MECHANICALLY_DERIVED":
            _fail(
                "REP_UPSTREAM_INVALID",
                "SCI-4 metric claims must be MECHANICALLY_DERIVED.",
                observation_id=observation_id,
            )
        claim_id = _text(metric_binding.get("claim_id"), f"observations[{index}].metric.claim_id")
        signed = _finite(
            metric_binding.get("signed_velocity_mps"),
            f"observations[{index}].metric.signed_velocity_mps",
        )
        directional = _positive(
            metric_binding.get("directional_velocity_mps"),
            f"observations[{index}].metric.directional_velocity_mps",
            "NON_FINITE_VELOCITY",
        )
        expected_directional = signed if polarity == "POSITIVE" else -signed
        if expected_directional <= 0 or not math.isclose(
            expected_directional, directional, rel_tol=1e-10, abs_tol=1e-12
        ):
            _fail(
                "REP_PHASE_MISMATCH",
                "Directional velocity must be phase-polarity times the original signed SCI-4 velocity; abs() normalization is not accepted.",
                observation_id=observation_id,
            )
        selection = _record(observation.get("selection"), f"observations[{index}].selection")
        authority = _text(selection.get("authority"), f"observations[{index}].selection.authority")
        if authority not in SELECTION_AUTHORITIES:
            _fail(
                "REFERENCE_POLICY_INVALID",
                "SCI-6 requires an explicit rep or SCI-5 selection authority.",
                observation_id=observation_id,
            )
        limitations = selection.get("limitations")
        if (
            not isinstance(limitations, list)
            or not limitations
            or any(not isinstance(item, str) or not item.strip() for item in limitations)
        ):
            _fail(
                "REQUIRED_EVIDENCE_MISSING",
                "Selection limitations must remain visible.",
                observation_id=observation_id,
            )
        selection_claim_id = selection.get("claim_id")
        if authority.startswith("SCI5_"):
            _text(selection.get("claim_id"), f"observations[{index}].selection.claim_id")
        if (
            selection_claim_id is not None
            and selection.get("claim_class") != "MECHANICALLY_DERIVED"
        ):
            _fail(
                "REFERENCE_POLICY_INVALID",
                "Selection claims must be MECHANICALLY_DERIVED.",
                observation_id=observation_id,
            )

        load_values.append(load_kg)
        observations.append(
            {
                "observation_id": observation_id,
                "rep_id": rep_id,
                "ordinal": ordinal,
                "external_load_kg": load_kg,
                "original_signed_velocity_mps": signed,
                "directional_velocity_mps": directional,
                "metric_claim_id": claim_id,
                "metric_claim_class": "MECHANICALLY_DERIVED",
                "selection_authority": authority,
                "selection_limitations": limitations,
            }
        )
    for left_index, left in enumerate(load_values):
        for right in load_values[left_index + 1 :]:
            if math.isclose(left, right, rel_tol=1e-10, abs_tol=1e-12):
                _fail(
                    "DUPLICATE_LOAD_LEVEL",
                    "Each profile must contain one point per unique external load level.",
                )
    if len({round(value, 12) for value in load_values}) < 2:
        _fail("DEGENERATE_LOAD_VARIANCE", "The load predictor has zero observed variance.")
    return context, observations, qualifications


def _fit(observations: list[dict[str, Any]], fit_method: str) -> dict[str, Any]:
    method = METHODS.get(fit_method)
    if method is None:
        _fail("METHOD_NOT_APPLICABLE", "SCI-6 received an unsupported fit method.")
    if fit_method == "TWO_POINT" and len(observations) != 2:
        _fail(
            "INSUFFICIENT_SAMPLES",
            "The two-point exact method requires exactly two unique load levels.",
        )
    if fit_method == "MULTI_POINT_OLS" and len(observations) < 3:
        _fail(
            "INSUFFICIENT_SAMPLES",
            "The multi-point OLS method requires at least three unique load levels.",
        )
    xs = [item["external_load_kg"] for item in observations]
    ys = [item["directional_velocity_mps"] for item in observations]
    if fit_method == "TWO_POINT":
        denominator = xs[1] - xs[0]
        if denominator == 0:
            _fail("DEGENERATE_LOAD_VARIANCE", "The two-point load difference must be non-zero.")
        slope = (ys[1] - ys[0]) / denominator
        intercept = ys[0] - slope * xs[0]
        mean_x = sum(xs) / 2.0
        mean_y = sum(ys) / 2.0
        fitted = [intercept + slope * x for x in xs]
        residuals = [y - fitted_value for y, fitted_value in zip(ys, fitted)]
        sse = sum(residual * residual for residual in residuals)
        sst = sum((value - mean_y) * (value - mean_y) for value in ys)
        r2 = None if sst <= 0 else 1.0
        diagnostics = {
            "n_observations": 2,
            "degrees_of_freedom_residual": 0,
            "sse_mps2": sse,
            "mse_mps2": None,
            "rmse_mps": math.sqrt(sse / 2.0),
            "r2": r2,
            "r2_interpretation": "AUTOMATIC_TWO_POINT_IDENTITY_NOT_FIT_QUALITY"
            if r2 is not None
            else "UNDEFINED_ZERO_RESPONSE_VARIANCE",
            "residual_standard_error_mps": None,
            "slope_standard_error_mps_per_kg": None,
            "intercept_standard_error_mps": None,
            "mean_external_load_kg": mean_x,
            "mean_directional_velocity_mps": mean_y,
        }
    else:
        mean_x = sum(xs) / len(xs)
        mean_y = sum(ys) / len(ys)
        centered_x = [x - mean_x for x in xs]
        centered_y = [y - mean_y for y in ys]
        sxx = sum(value * value for value in centered_x)
        if sxx <= 0 or not math.isfinite(sxx):
            _fail("DEGENERATE_LOAD_VARIANCE", "The multi-point OLS predictor has zero variance.")
        sxy = sum(x_value * y_value for x_value, y_value in zip(centered_x, centered_y))
        slope = sxy / sxx
        intercept = mean_y - slope * mean_x
        fitted = [intercept + slope * x for x in xs]
        residuals = [y - fitted_value for y, fitted_value in zip(ys, fitted)]
        sse = sum(residual * residual for residual in residuals)
        sst = sum(value * value for value in centered_y)
        r2 = None if sst <= 0 else max(0.0, min(1.0, 1.0 - sse / sst))
        degrees = len(xs) - 2
        mse = sse / degrees
        standard_error = math.sqrt(mse)
        slope_standard_error = math.sqrt(mse / sxx)
        intercept_standard_error = math.sqrt(mse * (1.0 / len(xs) + (mean_x * mean_x) / sxx))
        diagnostics = {
            "n_observations": len(xs),
            "degrees_of_freedom_residual": degrees,
            "sse_mps2": sse,
            "mse_mps2": mse,
            "rmse_mps": math.sqrt(sse / len(xs)),
            "r2": r2,
            "r2_interpretation": "OLS_RESIDUAL_DIAGNOSTIC"
            if r2 is not None
            else "UNDEFINED_ZERO_RESPONSE_VARIANCE",
            "residual_standard_error_mps": standard_error,
            "slope_standard_error_mps_per_kg": slope_standard_error,
            "intercept_standard_error_mps": intercept_standard_error,
            "mean_external_load_kg": mean_x,
            "mean_directional_velocity_mps": mean_y,
        }
    directionality = (
        "EXPECTED_NEGATIVE_SLOPE" if slope < 0 else "NON_NEGATIVE_SLOPE_REQUIRES_REVIEW"
    )
    applicability = (
        "APPLICABLE_WITHIN_OBSERVED_DOMAIN" if slope < 0 else "DIRECTIONALLY_INCONSISTENT"
    )
    model = {
        "fit_method": fit_method,
        "processor": {"id": PROCESSOR_ID, "version": PROCESSOR_VERSION},
        "method": {"id": method[0], "version": method[1]},
        "predictor": {"name": "external_load", "unit": "kg", "dimension": "mass"},
        "response": {"name": "directional_velocity", "unit": "m/s", "dimension": "speed"},
        "slope_mps_per_kg": slope,
        "intercept_mps": intercept,
        "observed_domain": {
            "external_load_min_kg": min(xs),
            "external_load_max_kg": max(xs),
            "directional_velocity_min_mps": min(ys),
            "directional_velocity_max_mps": max(ys),
        },
        "directionality_status": directionality,
        "applicability_status": applicability,
    }
    output_observations = [
        {
            **observation,
            "fitted_velocity_mps": fitted_value,
            "residual_mps": residual,
        }
        for observation, fitted_value, residual in zip(observations, fitted, residuals)
    ]
    diagnostics["directionality_status"] = directionality
    diagnostics["applicability_status"] = applicability
    return {"model": model, "observations": output_observations, "diagnostics": diagnostics}


def _predict(payload: dict[str, Any]) -> dict[str, Any]:
    model = _record(payload.get("model"), "model")
    if model.get("processor") != {"id": PROCESSOR_ID, "version": PROCESSOR_VERSION}:
        _fail("INPUT_INVALID", "Prediction model processor identity is not SCI-6.")
    fit_method = model.get("fit_method")
    if fit_method not in METHODS:
        _fail("INPUT_INVALID", "Prediction model fit method is unsupported.")
    expected_method = {"id": METHODS[fit_method][0], "version": METHODS[fit_method][1]}
    if model.get("method") != expected_method:
        _fail("INPUT_INVALID", "Prediction model method identity does not match its fit method.")
    if model.get("predictor") != {"name": "external_load", "unit": "kg", "dimension": "mass"}:
        _fail("INPUT_INVALID", "Prediction model predictor identity is unsupported.")
    if model.get("response") != {
        "name": "directional_velocity",
        "unit": "m/s",
        "dimension": "speed",
    }:
        _fail("INPUT_INVALID", "Prediction model response identity is unsupported.")
    slope = _finite(model.get("slope_mps_per_kg"), "model.slope_mps_per_kg")
    intercept = _finite(model.get("intercept_mps"), "model.intercept_mps")
    domain = _record(model.get("observed_domain"), "model.observed_domain")
    minimum = _finite(
        domain.get("external_load_min_kg"), "model.observed_domain.external_load_min_kg"
    )
    maximum = _finite(
        domain.get("external_load_max_kg"), "model.observed_domain.external_load_max_kg"
    )
    minimum_velocity = _positive(
        domain.get("directional_velocity_min_mps"),
        "model.observed_domain.directional_velocity_min_mps",
        "INPUT_INVALID",
    )
    maximum_velocity = _positive(
        domain.get("directional_velocity_max_mps"),
        "model.observed_domain.directional_velocity_max_mps",
        "INPUT_INVALID",
    )
    if minimum >= maximum or minimum_velocity > maximum_velocity:
        _fail("INPUT_INVALID", "Prediction model observed domain is invalid.")
    load = _positive(payload.get("prediction_load_kg"), "prediction_load_kg")
    if load < minimum or load > maximum:
        _fail(
            "EXTRAPOLATION_NOT_AUTHORIZED",
            "SCI-6 prediction is limited to the observed external-load domain.",
            minimum_kg=minimum,
            maximum_kg=maximum,
            requested_kg=load,
        )
    predicted = intercept + slope * load
    if not math.isfinite(predicted):
        _fail("NUMERICAL_OVERFLOW", "The interpolation result is not finite.")
    if predicted <= 0:
        _fail(
            "INPUT_INVALID",
            "SCI-6 interpolation cannot return a non-positive directional velocity.",
        )
    return {
        "profile_id": _text(payload.get("profile_id"), "profile_id"),
        "model": model,
        "prediction": {
            "external_load_kg": load,
            "directional_velocity_mps": predicted,
            "domain_status": "OBSERVED_DOMAIN_INTERPOLATION",
            "inverse_prediction": "NOT_SUPPORTED",
        },
    }


def process(payload: Any) -> dict[str, Any]:
    value = _record(payload, "SCI-6 engine payload")
    if value.get("processor") != {"id": PROCESSOR_ID, "version": PROCESSOR_VERSION}:
        _fail("INPUT_INVALID", "SCI-6 processor identity is not bound to this engine.")
    operation = value.get("operation", "FIT")
    if operation == "PREDICT":
        result = _predict(value)
        return {
            "status": "SUCCEEDED",
            "processor": {"id": PROCESSOR_ID, "version": PROCESSOR_VERSION},
            "method": PREDICTION_METHOD,
            **result,
            "uncertainty": {
                "kind": "NOT_AVAILABLE",
                "reason": "Measurement uncertainty and a validated prediction interval are not supplied by SCI-6 v1.",
                "source": {"kind": "METHOD", "method": PREDICTION_METHOD},
            },
        }
    if operation != "FIT":
        _fail("INPUT_INVALID", "SCI-6 operation must be FIT or PREDICT.")
    fit_method = value.get("fit_method")
    if not isinstance(fit_method, str):
        _fail("METHOD_NOT_APPLICABLE", "SCI-6 fit_method is required.")
    context, observations, qualifications = _validate_profile(value)
    fitted = _fit(observations, fit_method)
    return {
        "status": "SUCCEEDED",
        "processor": {"id": PROCESSOR_ID, "version": PROCESSOR_VERSION},
        "method": {"id": METHODS[fit_method][0], "version": METHODS[fit_method][1]},
        "fit_method": fit_method,
        "profile_id": context["profile_id"],
        "observations": fitted["observations"],
        "model": fitted["model"],
        "diagnostics": fitted["diagnostics"],
        "upstream_qualifications": qualifications,
        "uncertainty": {
            "kind": "NOT_AVAILABLE",
            "reason": "SCI-6 v1 does not receive measurement uncertainty or a validated empirical error distribution.",
            "source": {
                "kind": "METHOD",
                "method": {"id": METHODS[fit_method][0], "version": METHODS[fit_method][1]},
            },
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
                "message": "The SCI-6 engine could not decode its transport envelope.",
                "details": [{"key": "error_type", "value": type(error).__name__}],
            },
        }
    except Exception as error:  # pragma: no cover - defensive process boundary
        result = {
            "status": "INFRASTRUCTURE_FAILED",
            "exception": {
                "code": "INFRASTRUCTURE_EXCEPTION",
                "message": "The SCI-6 engine failed outside the scientific input contract.",
                "details": [{"key": "error_type", "value": type(error).__name__}],
            },
        }
    print(json.dumps(result, allow_nan=False, separators=(",", ":")))


if __name__ == "__main__":
    _main()
