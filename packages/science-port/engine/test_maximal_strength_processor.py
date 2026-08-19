import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import maximal_strength_processor as processor


def payload(
    operation="ESTIMATED_1RM",
    slope=-0.01,
    intercept=1.5,
    target=0.2,
    minimum_load=60.0,
    maximum_load=100.0,
    minimum_velocity=0.5,
    maximum_velocity=0.9,
):
    return {
        "processor": {
            "id": processor.PROCESSOR_ID,
            "version": processor.PROCESSOR_VERSION,
        },
        "operation": operation,
        "model": {
            "profile_id": "fixture-profile",
            "fit_method": "TWO_POINT",
            "slope_mps_per_kg": slope,
            "intercept_mps": intercept,
            "number_of_observations": 2,
            "observed_domain": {
                "external_load_min_kg": minimum_load,
                "external_load_max_kg": maximum_load,
                "directional_velocity_min_mps": minimum_velocity,
                "directional_velocity_max_mps": maximum_velocity,
            },
        },
        "target_velocity_mps": target,
    }


class MaximalStrengthProcessorTests(unittest.TestCase):
    def test_exact_inverse_and_sensitivity_oracle(self):
        result = processor.process(payload())
        self.assertEqual(result["estimated_load_kg"], 130.0)
        self.assertEqual(result["domain_classification"], "EXTRAPOLATED_ABOVE_OBSERVED_LOAD_DOMAIN")
        self.assertEqual(result["extrapolation"]["load_extrapolation_distance_above_kg"], 30.0)
        self.assertEqual(result["extrapolation"]["observed_load_span_kg"], 40.0)
        self.assertEqual(result["extrapolation"]["extrapolation_distance_to_span_ratio"], 0.75)
        self.assertEqual(result["sensitivity"]["d_load_d_target_velocity"], -100.0)
        self.assertEqual(result["sensitivity"]["d_load_d_intercept"], 100.0)
        self.assertEqual(result["sensitivity"]["d_load_d_slope"], 13000.0)

    def test_within_domain_classification(self):
        result = processor.process(payload(target=0.7))
        self.assertEqual(result["estimated_load_kg"], 80.0)
        self.assertEqual(result["domain_classification"], "WITHIN_OBSERVED_LOAD_DOMAIN")
        self.assertEqual(result["extrapolation"]["extrapolation_distance_to_span_ratio"], 0.0)

    def test_target_load_operation_can_report_non_negative_directionality(self):
        result = processor.process(
            payload(operation="TARGET_LOAD", slope=0.01, intercept=0.1, target=0.8)
        )
        self.assertEqual(result["estimated_load_kg"], 70.0)
        self.assertFalse(result["diagnostics"]["negative_slope_required_for_maximal_inference"])

    def test_maximal_inference_rejects_non_negative_slope(self):
        with self.assertRaises(processor.EngineFailure) as context:
            processor.process(payload(slope=0.01, intercept=0.1, target=0.8))
        self.assertEqual(context.exception.code, "EXPECTED_INVERSE_RELATIONSHIP_NOT_OBSERVED")

    def test_zero_slope_and_zero_target_fail_closed(self):
        with self.assertRaises(processor.EngineFailure) as slope_error:
            processor.process(payload(slope=0.0))
        self.assertEqual(slope_error.exception.code, "SLOPE_ZERO")
        with self.assertRaises(processor.EngineFailure) as target_error:
            processor.process(payload(target=0.0))
        self.assertEqual(target_error.exception.code, "TARGET_VELOCITY_INVALID")

    def test_non_positive_load_fails_closed(self):
        with self.assertRaises(processor.EngineFailure) as context:
            processor.process(payload(target=1.0, intercept=0.5, slope=-0.01))
        self.assertEqual(context.exception.code, "ESTIMATED_LOAD_NON_POSITIVE")

    def test_velocity_side_domain_is_retained(self):
        result = processor.process(payload(target=1.1))
        self.assertEqual(
            result["extrapolation"]["velocity_domain_classification"],
            "EXTRAPOLATED_ABOVE_OBSERVED_VELOCITY_DOMAIN",
        )


if __name__ == "__main__":
    unittest.main()
