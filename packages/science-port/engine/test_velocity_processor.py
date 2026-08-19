import math
import unittest

from velocity_processor import EngineFailure, process


def samples(step, count, position):
    return [
        {
            "sample_index": index,
            "time_s": index * step,
            "position_m": position(index * step),
        }
        for index in range(count)
    ]


def payload(sample_values, intervals=None, timebase=None):
    declared_step = (
        sample_values[1]["time_s"] - sample_values[0]["time_s"] if len(sample_values) > 1 else 0.0
    )
    return {
        "samples": sample_values,
        "intervals": intervals or [],
        "timebase": timebase
        or {
            "declared_time_step_s": declared_step,
            "declared_sample_count": len(sample_values),
            "provenance_reference": "fixture:timebase-1",
        },
        "configuration": {
            "minimum_samples": 3,
            "uniform_absolute_tolerance_seconds": 1e-12,
            "uniform_relative_tolerance": 1e-9,
        },
    }


class VelocityProcessorTests(unittest.TestCase):
    def test_linear_and_quadratic_oracles(self):
        linear = process(payload(samples(0.1, 5, lambda t: 2 * t + 1)))
        self.assertEqual(linear["status"], "SUCCEEDED")
        self.assertTrue(
            all(
                math.isclose(sample["velocity_mps"], 2.0, rel_tol=0.0, abs_tol=1e-12)
                for sample in linear["velocity_samples"]
            )
        )

        quadratic = process(payload(samples(0.1, 5, lambda t: 3 * t * t + 2 * t + 1)))
        expected = [2.0, 2.6, 3.2, 3.8, 4.4]
        self.assertEqual(quadratic["status"], "SUCCEEDED")
        for actual, reference in zip(quadratic["velocity_samples"], expected):
            self.assertAlmostEqual(actual["velocity_mps"], reference, places=12)

    def test_sinusoidal_convergence_is_second_order(self):
        errors = []
        omega = 3.0
        for step, count in ((0.1, 11), (0.05, 21), (0.025, 41)):
            result = process(payload(samples(step, count, lambda t: math.sin(omega * t))))
            error = max(
                abs(sample["velocity_mps"] - omega * math.cos(omega * sample["time_s"]))
                for sample in result["velocity_samples"]
            )
            errors.append(error)
        self.assertLess(errors[1], errors[0] / 3)
        self.assertLess(errors[2], errors[1] / 3)

    def test_explicit_interval_summary_is_signed(self):
        result = process(
            payload(
                samples(0.1, 5, lambda t: -2 * t),
                [
                    {
                        "id": "manual-interval",
                        "start_index": 1,
                        "end_index": 3,
                        "qualification_reference": "manual:phase-1",
                    }
                ],
            )
        )
        summary = result["interval_summaries"][0]
        self.assertAlmostEqual(summary["interval_average_velocity_mps"], -2.0)
        self.assertAlmostEqual(summary["peak_sampled_velocity_mps"], -2.0)

    def test_adversarial_timebase_failures_are_structured(self):
        with self.assertRaises(EngineFailure) as duplicate_context:
            process(
                payload(
                    [
                        {"sample_index": 0, "time_s": 0.0, "position_m": 0.0},
                        {"sample_index": 1, "time_s": 0.1, "position_m": 0.1},
                        {"sample_index": 2, "time_s": 0.1, "position_m": 0.2},
                    ]
                )
            )
        self.assertEqual(duplicate_context.exception.code, "DUPLICATE_TIMESTAMP")

        with self.assertRaises(EngineFailure) as irregular_context:
            process(
                payload(
                    [
                        {"sample_index": 0, "time_s": 0.0, "position_m": 0.0},
                        {"sample_index": 1, "time_s": 0.1, "position_m": 0.1},
                        {"sample_index": 2, "time_s": 0.25, "position_m": 0.25},
                    ]
                )
            )
        self.assertEqual(irregular_context.exception.code, "IRREGULAR_TIMEBASE_UNSUPPORTED")

        tiny_step = [
            {"sample_index": 0, "time_s": 0.0, "position_m": 0.0},
            {"sample_index": 1, "time_s": 1e-15, "position_m": 1e-15},
            {"sample_index": 2, "time_s": 1.001e-12, "position_m": 1.001e-12},
        ]
        with self.assertRaises(EngineFailure) as tiny_context:
            process(payload(tiny_step))
        self.assertEqual(tiny_context.exception.code, "SAMPLING_INTERVAL_INVALID")

        with self.assertRaises(EngineFailure) as overflow_context:
            process(
                payload(
                    [
                        {"sample_index": 0, "time_s": 0.0, "position_m": -1e308},
                        {"sample_index": 1, "time_s": 0.1, "position_m": 0.0},
                        {"sample_index": 2, "time_s": 0.2, "position_m": 1e308},
                    ]
                )
            )
        self.assertEqual(overflow_context.exception.code, "NUMERICAL_OVERFLOW")

        with self.assertRaises(EngineFailure) as denominator_context:
            process(
                payload(
                    [
                        {"sample_index": 0, "time_s": -1e308, "position_m": 0.0},
                        {"sample_index": 1, "time_s": 0.0, "position_m": 1.0},
                        {"sample_index": 2, "time_s": 1e308, "position_m": 2.0},
                    ]
                )
            )
        self.assertEqual(denominator_context.exception.code, "NUMERICAL_OVERFLOW")


if __name__ == "__main__":
    unittest.main()
