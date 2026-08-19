"""Independent numerical checks for the SCI-6 Python authority."""

from __future__ import annotations

import unittest

from load_velocity_profile_processor import EngineFailure, process


def _configuration(load_kg: float) -> dict[str, object]:
    return {
        "id": "load-fixture-barbell",
        "version": "1.0.0",
        "revision": 1,
        "kind": "LOAD_CONFIGURATION",
        "interaction": "GRAVITATIONAL_FREE_MASS",
        "resistance": {
            "kind": "MASS",
            "quantity": {"value": load_kg, "unit": "kg", "dimension": "mass"},
            "declaration": "Explicit external implement mass.",
        },
        "load_object": {"objectKind": "IMPLEMENT", "objectId": "barbell-1"},
        "placement": {"kind": "SHOULDER_BACK", "contactObjects": []},
        "distribution": "SYMMETRIC",
        "direction": None,
        "profile": "APPROXIMATELY_CONSTANT",
        "mechanical_feedback": {
            "kind": "MOTION_INDEPENDENT_DECLARED",
            "description": "Declared fixture mechanism.",
        },
        "rationale": "Synthetic SCI-6 numerical fixture.",
    }


def _payload(
    loads: list[float],
    velocities: list[float],
    fit_method: str = "MULTI_POINT_OLS",
) -> dict[str, object]:
    observations = []
    for index, (load, velocity) in enumerate(zip(loads, velocities), start=1):
        observations.append(
            {
                "observation_id": f"observation-{index}",
                "rep_id": f"rep-{index}",
                "ordinal": index,
                "complete": True,
                "external_load": {"value": load, "unit": "kg", "dimension": "mass"},
                "load_configuration": _configuration(load),
                "metric": {
                    "metric_id": "PHASE_INTERVAL_AVERAGE_SIGNED_LINEAR_VELOCITY",
                    "metric_version": "1.0.0",
                    "method": {
                        "id": "rep_phase_metrics.sample_aligned_claim_binding",
                        "version": "1.0.0",
                    },
                    "signed_velocity_mps": velocity,
                    "directional_velocity_mps": velocity,
                    "claim_id": f"claim-{index}",
                    "claim_class": "MECHANICALLY_DERIVED",
                    "qualification_status": "QUALIFIED_SOFTWARE",
                    "validity": "VALID",
                },
                "selection": {
                    "authority": "EXPLICIT_REP_METRIC",
                    "limitations": ["Synthetic explicit selection."],
                },
            }
        )
    return {
        "processor": {
            "id": "resistance_training.load_velocity_profile",
            "version": "1.0.0",
        },
        "operation": "FIT",
        "fit_method": fit_method,
        "profile_context": {
            "profile_id": "profile-python-fixture",
            "athlete_id": "athlete-python-fixture",
            "session_id": "session-python-fixture",
            "assessment_id": "assessment-python-fixture",
            "trial_id": "trial-python-fixture",
            "exercise_definition": {"id": "exercise", "version": "1.0.0", "revision": 1},
            "exercise_variation": None,
            "movement_task": {"id": "task", "version": "1.0.0", "revision": 1},
            "selected_phase": {
                "id": "phase",
                "version": "1.0.0",
                "revision": 1,
                "phase_id": "concentric",
                "polarity": "POSITIVE",
            },
            "metric_definition": {
                "id": "PHASE_INTERVAL_AVERAGE_SIGNED_LINEAR_VELOCITY",
                "version": "1.0.0",
                "unit": "m/s",
                "dimension": "speed",
                "method": {
                    "id": "rep_phase_metrics.sample_aligned_claim_binding",
                    "version": "1.0.0",
                },
            },
            "measurement": {
                "object_of_interest": {"object_kind": "IMPLEMENT", "object_id": "barbell-1"},
                "measurement_point": {
                    "object_kind": "MEASUREMENT_POINT",
                    "object_id": "barbell-point-1",
                },
                "reference_frame": {
                    "frame_kind": "GLOBAL_LAB",
                    "frame_id": "lab-frame-1",
                    "convention": "z-up",
                },
                "axis": {"axis": "Z", "sense": "POSITIVE", "frame_id": "lab-frame-1"},
                "modality": {
                    "modality_id": "fixture-encoder",
                    "version": "1.0.0",
                    "kind": "ENCODER",
                },
            },
        },
        "upstream_qualifications": [
            {
                "capability_id": "resistance_training.rep_phase_kinematic_metrics",
                "capability_version": "1.0.0",
                "qualification_status": "QUALIFIED_SOFTWARE",
                "qualification_artifact": {"type": "SCI4_QUALIFICATION", "ref": "fixture"},
                "limitations": ["Empirical validation pending."],
            }
        ],
        "observations": observations,
    }


class LoadVelocityProfileProcessorTest(unittest.TestCase):
    def test_two_point_exact_line(self) -> None:
        result = process(_payload([50, 100], [1.0, 0.5], "TWO_POINT"))
        self.assertEqual(result["status"], "SUCCEEDED")
        model = result["model"]
        self.assertAlmostEqual(model["slope_mps_per_kg"], -0.01, places=12)
        self.assertAlmostEqual(model["intercept_mps"], 1.5, places=12)
        self.assertEqual(result["diagnostics"]["r2"], 1.0)
        self.assertEqual(result["diagnostics"]["residual_standard_error_mps"], None)

    def test_multi_point_ols_reference_values(self) -> None:
        result = process(_payload([40, 60, 80, 100], [1.1, 0.9, 0.55, 0.4]))
        self.assertEqual(result["status"], "SUCCEEDED")
        model = result["model"]
        self.assertAlmostEqual(model["slope_mps_per_kg"], -0.01225, places=12)
        self.assertAlmostEqual(model["intercept_mps"], 1.595, places=12)
        self.assertAlmostEqual(result["diagnostics"]["r2"], 0.9780040733197556, places=12)

    def test_zero_response_variance_does_not_invent_two_point_r2(self) -> None:
        result = process(_payload([50, 100], [1.0, 1.0], "TWO_POINT"))
        self.assertIsNone(result["diagnostics"]["r2"])
        self.assertEqual(
            result["diagnostics"]["r2_interpretation"],
            "UNDEFINED_ZERO_RESPONSE_VARIANCE",
        )

    def test_duplicate_load_and_extrapolation_fail_closed(self) -> None:
        with self.assertRaises(EngineFailure) as duplicate:
            process(_payload([50, 50], [1.0, 0.8], "TWO_POINT"))
        self.assertEqual(duplicate.exception.code, "DUPLICATE_LOAD_LEVEL")

        fit = process(_payload([50, 100], [1.0, 0.5], "TWO_POINT"))
        prediction = {
            "processor": {
                "id": "resistance_training.load_velocity_profile",
                "version": "1.0.0",
            },
            "operation": "PREDICT",
            "profile_id": "profile-python-fixture",
            "model": fit["model"],
            "prediction_load_kg": 125,
        }
        with self.assertRaises(EngineFailure) as extrapolation:
            process(prediction)
        self.assertEqual(extrapolation.exception.code, "EXTRAPOLATION_NOT_AUTHORIZED")

    def test_non_positive_interpolation_fails_closed(self) -> None:
        fit = process(_payload([1, 2, 3], [100, 1, 1]))
        prediction = {
            "processor": {
                "id": "resistance_training.load_velocity_profile",
                "version": "1.0.0",
            },
            "operation": "PREDICT",
            "profile_id": "profile-python-fixture",
            "model": fit["model"],
            "prediction_load_kg": 3,
        }
        with self.assertRaises(EngineFailure) as non_positive:
            process(prediction)
        self.assertEqual(non_positive.exception.code, "INPUT_INVALID")


if __name__ == "__main__":
    unittest.main()
