from __future__ import annotations

import unittest

from rep_phase_kinematic_metrics_processor import EngineFailure, process


def payload(
    velocities: list[float],
    positions: list[float],
    polarity: str = "POSITIVE",
    start: int = 1,
    end: int = 3,
) -> dict:
    samples = [
        {
            "sample_index": index,
            "time_s": index * 0.1,
            "position_m": positions[index],
            "velocity_mps": velocities[index],
        }
        for index in range(len(velocities))
    ]
    phase_id = "phase-a"
    return {
        "samples": samples,
        "timebase": {
            "declared_step_s": 0.1,
            "declared_sample_count": len(samples),
        },
        "sci2_claim_id": "sci2-claim",
        "phase_intervals": [
            {
                "id": "sci3-claim:rep-1:phase-phase-a",
                "rep_ordinal": 1,
                "phase_id": phase_id,
                "phase_ordinal": 1,
                "phase_action": "CONCENTRIC",
                "polarity": polarity,
                "start_index": start,
                "end_index": end,
                "interval_authority": "SCI3_AUTOMATIC_SEGMENTATION",
                "qualification_reference": "sci2-interval-qualification",
                "requested_metric_ids": [
                    "PHASE_DURATION",
                    "PHASE_SIGNED_DISPLACEMENT",
                    "PHASE_INTERVAL_AVERAGE_SIGNED_LINEAR_VELOCITY",
                    "PHASE_DIRECTION_PEAK_SAMPLED_LINEAR_VELOCITY",
                ],
            }
        ],
        "rep_intervals": [
            {
                "rep_ordinal": 1,
                "start_index": 0,
                "end_index": len(samples) - 1,
                "requested_metric_ids": ["REP_TOTAL_DURATION"],
            }
        ],
        "sci2_interval_summaries": [
            {
                "id": "sci2-interval-1",
                "velocity_claim_id": "sci2-claim",
                "qualification_reference": "sci2-interval-qualification",
                "start_index": start,
                "end_index": end,
                "interval_average_velocity_mps": (positions[end] - positions[start])
                / ((end - start) * 0.1),
            }
        ],
        "configuration": {
            "uniform_absolute_tolerance_s": 1e-12,
            "uniform_relative_tolerance": 1e-9,
        },
    }


class RepPhaseMetricProcessorTest(unittest.TestCase):
    def test_positive_phase_metrics_and_repetition_duration(self) -> None:
        result = process(
            payload(
                [0.0, 1.0, 2.0, 3.0, 2.0, 0.0],
                [0.0, 0.1, 0.3, 0.6, 0.8, 0.8],
            )
        )
        self.assertEqual(result["status"], "SUCCEEDED")
        phase = result["phase_results"][0]
        metrics = {metric["metric_id"]: metric for metric in phase["metrics"]}
        self.assertAlmostEqual(metrics["PHASE_DURATION"]["value"], 0.2)
        self.assertAlmostEqual(metrics["PHASE_SIGNED_DISPLACEMENT"]["value"], 0.5)
        self.assertAlmostEqual(
            metrics["PHASE_INTERVAL_AVERAGE_SIGNED_LINEAR_VELOCITY"]["value"], 2.5
        )
        self.assertEqual(metrics["PHASE_DIRECTION_PEAK_SAMPLED_LINEAR_VELOCITY"]["value"], 3.0)
        self.assertEqual(
            metrics["PHASE_DIRECTION_PEAK_SAMPLED_LINEAR_VELOCITY"]["selected_sample_index"],
            3,
        )
        self.assertAlmostEqual(result["rep_results"][0]["metrics"][0]["value"], 0.5)

    def test_negative_phase_uses_minimum_signed_velocity(self) -> None:
        result = process(
            payload(
                [0.0, -1.0, -2.0, -3.0, -2.0, 0.0],
                [0.0, -0.1, -0.3, -0.6, -0.8, -0.8],
                polarity="NEGATIVE",
            )
        )
        metric = result["phase_results"][0]["metrics"][-1]
        self.assertEqual(metric["metric_id"], "PHASE_DIRECTION_PEAK_SAMPLED_LINEAR_VELOCITY")
        self.assertEqual(metric["value"], -3.0)
        self.assertEqual(metric["selected_sample_index"], 3)

    def test_extremum_tie_selects_earliest_sample(self) -> None:
        result = process(
            payload(
                [0.0, 3.0, 3.0, 1.0],
                [0.0, 0.3, 0.6, 0.7],
                start=0,
                end=3,
            )
        )
        metric = result["phase_results"][0]["metrics"][-1]
        self.assertEqual(metric["value"], 3.0)
        self.assertEqual(metric["selected_sample_index"], 1)

    def test_missing_sci2_summary_fails_closed(self) -> None:
        candidate = payload(
            [0.0, 1.0, 2.0, 3.0],
            [0.0, 0.1, 0.3, 0.6],
        )
        candidate["sci2_interval_summaries"] = []
        with self.assertRaises(EngineFailure) as context:
            process(candidate)
        self.assertEqual(context.exception.code, "SCI2_INTERVAL_MISMATCH")


if __name__ == "__main__":
    unittest.main()
