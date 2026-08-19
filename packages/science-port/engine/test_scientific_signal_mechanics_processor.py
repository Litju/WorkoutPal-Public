import sys
import unittest
from pathlib import Path
from typing import cast

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import scientific_signal_mechanics_processor as processor


def make_signal(
    values: list[float],
    times: list[float] | None = None,
    *,
    dimension: str = "length",
    unit: str = "m",
    signal_id: str = "fixture-signal",
    missing: list[int] | None = None,
    gaps: list[dict[str, float]] | None = None,
) -> dict[str, object]:
    actual_times = times if times is not None else [float(index) for index in range(len(values))]
    return {
        "signal_id": signal_id,
        "values": values,
        "times_s": actual_times,
        "sample_indexes": list(range(len(values))),
        "unit": unit,
        "dimension": dimension,
        "missing_sample_indices": missing or [],
        "gap_intervals": gaps or [],
        "timebase": {"classification": "UNIFORM"},
    }


def payload(
    operation: str,
    signal: dict[str, object],
    options: dict[str, object] | None = None,
    **extra: object,
) -> dict[str, object]:
    return {
        "processor": {"id": processor.PROCESSOR_ID, "version": processor.PROCESSOR_VERSION},
        "operation": operation,
        "signal": signal,
        "options": options or {},
        **extra,
    }


class ScientificSignalMechanicsProcessorTests(unittest.TestCase):
    def test_first_derivative_linear_oracle_and_irregular_grid(self) -> None:
        times = [0.0, 0.5, 1.4, 2.0, 3.1]
        result = processor.process(
            payload(
                "DERIVATIVE",
                make_signal([2.0 * value + 4.0 for value in times], times),
                {"order": 1},
            )
        )
        self.assertEqual(result["status"], "SUCCEEDED")
        output = result["output"]
        self.assertTrue(np.allclose(output["values"], 2.0))
        self.assertEqual(output["method_detail"], "SECOND_ORDER_NONUNIFORM_GRADIENT")

    def test_second_derivative_quadratic_oracle(self) -> None:
        times = [float(index) / 4.0 for index in range(9)]
        result = processor.process(
            payload(
                "DERIVATIVE", make_signal([value * value for value in times], times), {"order": 2}
            )
        )
        values = result["output"]["values"]
        self.assertTrue(np.allclose(values[2:-2], 2.0, atol=1e-10))
        self.assertEqual(result["output"]["method_detail"], "REPEATED_FIRST_SECOND_ORDER_GRADIENT")

    def test_trapezoid_cumulative_requires_explicit_initial_condition(self) -> None:
        signal = make_signal([3.0, 3.0, 3.0], [0.0, 0.5, 1.0], dimension="speed", unit="m/s")
        result = processor.process(
            payload("INTEGRATE", signal, {"mode": "CUMULATIVE", "initial_value": 2.0})
        )
        self.assertEqual(result["output"]["values"], [2.0, 3.5, 5.0])
        with self.assertRaises(processor.EngineFailure) as failure:
            processor.process(payload("INTEGRATE", signal, {"mode": "CUMULATIVE"}))
        self.assertEqual(failure.exception.code, "INVALID_INITIAL_CONDITION")

    def test_interval_integral_and_missing_gap_fail_closed(self) -> None:
        signal = make_signal(
            [1.0, 1.0],
            [1.0, 2.0],
            dimension="speed",
            unit="m/s",
            gaps=[{"start_s": 1.4, "end_s": 1.8}],
        )
        with self.assertRaises(processor.EngineFailure) as failure:
            processor.process(
                payload("INTEGRATE", signal, {"mode": "INTERVAL", "initial_value": 0.0})
            )
        self.assertEqual(failure.exception.code, "MISSING_SAMPLE_GAP")

    def test_interpolation_is_internal_and_retains_brackets(self) -> None:
        signal = make_signal([0.0, 10.0], [0.0, 2.0])
        result = processor.process(payload("INTERPOLATE", signal, {"target_time_s": 0.5}))
        self.assertEqual(result["output"]["value"], 2.5)
        self.assertEqual(result["output"]["bracketing"]["left_index"], 0)
        with self.assertRaises(processor.EngineFailure) as failure:
            processor.process(payload("INTERPOLATE", signal, {"target_time_s": 2.1}))
        self.assertEqual(failure.exception.code, "INTERPOLATION_OUTSIDE_DOMAIN")

    def test_downsample_declares_polyphase_antialiasing(self) -> None:
        times = [index / 100.0 for index in range(1000)]
        values = [
            float(np.sin(2 * np.pi * 3 * time) + 0.2 * np.sin(2 * np.pi * 40 * time))
            for time in times
        ]
        result = processor.process(
            payload("RESAMPLE", make_signal(values, times), {"target_rate_hz": 50.0})
        )
        output = result["output"]
        self.assertEqual(output["rational_up"], 1)
        self.assertEqual(output["rational_down"], 2)
        self.assertEqual(output["anti_aliasing"], "EXPLICIT_POLYPHASE_LOW_PASS_FIR")
        self.assertAlmostEqual(output["times_s"][1] - output["times_s"][0], 0.02, places=12)

    def test_irregular_to_uniform_regrid_is_explicit_and_not_antialiasing(self) -> None:
        source = make_signal([0.0, 1.0, 2.0, 3.0], [0.0, 0.8, 2.1, 3.0])
        source["timebase"] = {"classification": "IRREGULAR"}
        with self.assertRaises(processor.EngineFailure) as failure:
            processor.process(payload("RESAMPLE", source, {"target_rate_hz": 1.0}))
        self.assertEqual(failure.exception.code, "IRREGULAR_TIMEBASE_UNSUPPORTED")
        result = processor.process(
            payload(
                "RESAMPLE",
                source,
                {
                    "target_rate_hz": 1.0,
                    "grid_policy": "EXPLICIT_LINEAR_REGRID",
                    "target_times_s": [0.0, 1.0, 2.0, 3.0],
                },
            )
        )
        self.assertEqual(result["method"]["id"], processor.REGRID_METHOD_ID)
        self.assertEqual(result["output"]["anti_aliasing"], "NOT_APPLICABLE_INTERPOLATION_REGRID")

    def test_filter_metadata_and_online_zero_phase_guard(self) -> None:
        times = [index / 100.0 for index in range(300)]
        values = [
            float(np.sin(2 * np.pi * 2 * time) + 0.5 * np.sin(2 * np.pi * 30 * time))
            for time in times
        ]
        result = processor.process(
            payload(
                "FILTER",
                make_signal(values, times),
                {
                    "sample_rate_hz": 100.0,
                    "filter_type": "LOWPASS",
                    "order": 4,
                    "cutoff_hz": 8.0,
                    "mode": "ZERO_PHASE",
                    "online": False,
                    "padtype": "odd",
                    "padlen": 27,
                },
            )
        )
        self.assertEqual(result["output"]["method_detail"], "BUTTERWORTH_SECOND_ORDER_SECTIONS")
        self.assertTrue(result["output"]["zero_phase"])
        with self.assertRaises(processor.EngineFailure) as failure:
            processor.process(
                payload(
                    "FILTER",
                    make_signal(values, times),
                    {
                        "sample_rate_hz": 100.0,
                        "filter_type": "LOWPASS",
                        "order": 2,
                        "cutoff_hz": 8.0,
                        "mode": "ZERO_PHASE",
                        "online": True,
                    },
                )
            )
        self.assertEqual(failure.exception.code, "ZERO_PHASE_NOT_ALLOWED_ONLINE")

    def test_declared_sync_offset_and_events(self) -> None:
        source = make_signal([0.0, -1.0, 1.0, 2.0], [0.0, 1.0, 2.0, 3.0], signal_id="source")
        reference = make_signal(
            [10.0, 11.0, 12.0, 13.0], [0.5, 1.5, 2.5, 3.5], signal_id="reference"
        )
        result = processor.process(
            payload(
                "SYNCHRONIZE",
                source,
                {"offset_s": 0.5, "alignment_mode": "EXACT_COMMON_TIMESTAMPS"},
                reference=reference,
            )
        )
        self.assertEqual(result["output"]["offset_s"], 0.5)
        event_result = processor.process(
            payload(
                "DETECT_EVENTS",
                make_signal([-1.0, -0.5, 0.5, 1.0], [0.0, 1.0, 2.0, 3.0]),
                {"kind": "THRESHOLD", "threshold": 0.0, "direction": "RISING", "timing": "LINEAR"},
            )
        )
        self.assertEqual(len(event_result["output"]["events"]), 1)
        self.assertEqual(event_result["output"]["events"][0]["time_s"], 1.5)

    def test_interval_duration_has_explicit_inclusivity(self) -> None:
        result = processor.process(
            payload(
                "INTERVAL",
                make_signal([1.0, 2.0, 3.0], [10.0, 10.5, 11.25]),
                {"start_index": 0, "end_index": 2, "start_inclusive": True, "end_inclusive": False},
            )
        )
        self.assertEqual(result["output"]["duration_s"], 1.25)
        self.assertFalse(result["output"]["end_inclusive"])

    def test_determinism_and_no_mutation(self) -> None:
        signal = make_signal([1.0, 3.0, 5.0], [0.0, 1.0, 2.0])
        before = list(cast(list[float], signal["values"]))
        first = processor.process(payload("DERIVATIVE", signal, {"order": 1}))
        second = processor.process(payload("DERIVATIVE", signal, {"order": 1}))
        self.assertEqual(first, second)
        self.assertEqual(signal["values"], before)

    def test_sinusoidal_derivative_converges_with_grid_refinement(self) -> None:
        errors: list[float] = []
        for count in (33, 65, 129):
            times = np.linspace(0.0, 2.0 * np.pi, count).tolist()
            values = np.sin(np.asarray(times)).tolist()
            result = processor.process(
                payload("DERIVATIVE", make_signal(values, times), {"order": 1})
            )
            estimate = np.asarray(result["output"]["values"])[2:-2]
            oracle = np.cos(np.asarray(times))[2:-2]
            errors.append(float(np.max(np.abs(estimate - oracle))))
        self.assertLess(errors[1], errors[0])
        self.assertLess(errors[2], errors[1])


if __name__ == "__main__":
    unittest.main()
