import copy
import unittest

from segmentation_processor import EngineFailure, process


def configuration():
    return {
        "velocity_enter_threshold_mps": 0.05,
        "velocity_exit_threshold_mps": 0.025,
        "minimum_sustained_samples": 2,
        "minimum_preroll_samples": 3,
        "minimum_postroll_samples": 3,
        "minimum_phase_duration_s": 0.1,
        "minimum_repetition_duration_s": 0.5,
        "minimum_excursion_m": 0.01,
        "uniform_absolute_tolerance_s": 1e-12,
        "uniform_relative_tolerance": 1e-9,
        "filtering": "NONE",
        "interpolation": "NONE",
        "dwell_policy": "ALLOWED",
        "boundary_policy": "SAMPLED_ONLY_NO_INTERPOLATION",
    }


def task_and_protocol(reverse=False):
    phases = [
        {
            "id": "phase-up",
            "ordinal": 1,
            "label": "declared upward task phase",
            "action": "CONCENTRIC",
            "description": None,
        },
        {
            "id": "phase-down",
            "ordinal": 2,
            "label": "declared downward task phase",
            "action": "ECCENTRIC",
            "description": None,
        },
    ]
    task = {
        "kind": "MOVEMENT_TASK",
        "id": "fixture-task",
        "version": "1.0.0",
        "revision": 1,
        "phases": phases,
    }
    ordered = (
        [
            (phases[1], "NEGATIVE"),
            (phases[0], "POSITIVE"),
        ]
        if reverse
        else [
            (phases[0], "POSITIVE"),
            (phases[1], "NEGATIVE"),
        ]
    )
    protocol = {
        "kind": "SEGMENTATION_PROTOCOL",
        "id": "fixture-segmentation-protocol",
        "version": "1.0.0",
        "revision": 1,
        "supported_task_class": "ONE_DIMENSIONAL_BIDIRECTIONAL_IMPLEMENT_MOTION_2_PHASE",
        "movement_task": {
            "id": task["id"],
            "version": task["version"],
            "revision": task["revision"],
        },
        "expected_phase_sequence": [
            {
                "movement_task": {
                    "id": task["id"],
                    "version": task["version"],
                    "revision": task["revision"],
                },
                "phase_id": phase["id"],
                "phase_ordinal": phase["ordinal"],
                "phase_action": phase["action"],
                "polarity": polarity,
            }
            for phase, polarity in ordered
        ],
        "filtering_policy": "NONE_ONLY",
        "interpolation_policy": "NONE_ONLY",
        "dwell_policy": "ALLOWED",
        "boundary_policy": "SAMPLED_ONLY_NO_INTERPOLATION",
    }
    return task, protocol


def metadata():
    frame = {"frame_kind": "GLOBAL_LAB", "frame_id": "fixture-lab", "convention": "z-up"}
    return {
        "object_of_interest": {
            "object_kind": "IMPLEMENT",
            "object_id": "fixture-implement",
        },
        "measurement_point": {
            "object_kind": "MEASUREMENT_POINT",
            "object_id": "fixture-tether-point",
        },
        "reference_frame": frame,
        "axis": {
            "axis": "Z",
            "sense": "POSITIVE",
            "frame": frame,
        },
        "modality": {"kind": "POSITION_TRANSDUCER", "id": "fixture-transducer"},
        "assessment_id": "fixture-assessment",
        "trial_id": "fixture-trial",
        "quality": {
            "input": "VALID",
            "acquisition": "VALID",
            "trial": "VALID",
            "exclusion": "INCLUDED",
            "protocol": "APPLICABLE",
        },
        "calibration_status": "NOT_REQUIRED",
    }


def sci2_lineage():
    revision = "a" * 40
    return {
        "claim_id": "velocity-claim-fixture",
        "processor": {
            "id": "resistance_training.linear_velocity_from_position",
            "version": "1.0.0",
        },
        "method": {
            "id": "finite_difference.second_order_uniform",
            "version": "1.0.0",
        },
        "software": {
            "package_name": "@workoutpal/science-port",
            "package_version": "0.1.0",
            "source_revision": revision,
            "build_id": "fixture-build",
        },
        "qualification": {
            "status": "QUALIFIED",
            "source_revision": revision,
            "build_id": "fixture-build",
        },
    }


def payload(velocities, step=0.1, reverse=False):
    positions = []
    position = 0.0
    for velocity in velocities:
        positions.append(position)
        position += velocity * step
    samples = [
        {
            "sample_index": index,
            "time_s": index * step,
            "position_m": position_m,
            "velocity_mps": velocity,
        }
        for index, (position_m, velocity) in enumerate(zip(positions, velocities))
    ]
    task, protocol = task_and_protocol(reverse=reverse)
    return {
        "samples": samples,
        "timebase": {
            "declared_time_step_s": step,
            "declared_sample_count": len(samples),
            "provenance_reference": "fixture:timebase-1",
        },
        "measurement": metadata(),
        "sci2_lineage": sci2_lineage(),
        "movement_task": task,
        "protocol": protocol,
        "configuration": configuration(),
    }


def two_repetitions(first=0.1, second=-0.1, step=0.1):
    return [
        0.0,
        0.0,
        0.0,
        first,
        first,
        first,
        first,
        0.0,
        0.0,
        second,
        second,
        second,
        second,
        0.0,
        0.0,
        first,
        first,
        first,
        first,
        0.0,
        0.0,
        second,
        second,
        second,
        second,
        0.0,
        0.0,
        0.0,
    ]


class SegmentationProcessorTests(unittest.TestCase):
    def test_two_repetition_oracle_and_sample_boundaries(self):
        result = process(payload(two_repetitions()))
        self.assertEqual(result["status"], "SUCCEEDED")
        self.assertEqual(len(result["repetitions"]), 2)
        self.assertEqual(
            [
                (rep["start"]["sample_index"], rep["end"]["sample_index"])
                for rep in result["repetitions"]
            ],
            [(3, 12), (15, 24)],
        )
        self.assertEqual(
            [
                [
                    (phase["start"]["sample_index"], phase["end"]["sample_index"])
                    for phase in rep["phases"]
                ]
                for rep in result["repetitions"]
            ],
            [[(3, 6), (9, 12)], [(15, 18), (21, 24)]],
        )
        self.assertEqual(result["diagnostics"]["performance_metrics"], "NOT_COMPUTED")

    def test_reversed_phase_order_is_protocol_defined(self):
        velocities = two_repetitions(first=-0.1, second=0.1)
        result = process(payload(velocities, reverse=True))
        self.assertEqual(result["status"], "SUCCEEDED")
        self.assertEqual(
            [phase["polarity"] for phase in result["repetitions"][0]["phases"]],
            ["NEGATIVE", "POSITIVE"],
        )

    def test_pause_is_reported_and_zero_is_not_a_reversal(self):
        result = process(payload(two_repetitions()))
        pauses = [
            interval
            for rep in result["repetitions"]
            for interval in rep["dwell_intervals"]
            if interval["kind"] == "REVERSAL_PAUSE"
        ]
        self.assertEqual(len(pauses), 2)
        self.assertEqual(
            [(pause["start"]["sample_index"], pause["end"]["sample_index"]) for pause in pauses],
            [(7, 8), (19, 20)],
        )

    def test_variable_duration_amplitude_and_short_interrep_rest(self):
        values = [
            0.0,
            0.0,
            0.0,
            0.08,
            0.08,
            0.08,
            0.08,
            0.0,
            -0.12,
            -0.12,
            -0.12,
            -0.12,
            0.15,
            0.15,
            0.15,
            0.15,
            -0.08,
            -0.08,
            -0.08,
            -0.08,
            0.0,
            0.0,
            0.0,
        ]
        result = process(payload(values))
        self.assertEqual(result["status"], "SUCCEEDED")
        self.assertEqual(len(result["repetitions"]), 2)
        self.assertEqual(
            [
                (rep["start"]["sample_index"], rep["end"]["sample_index"])
                for rep in result["repetitions"]
            ],
            [(3, 11), (12, 19)],
        )

    def test_no_movement_and_partial_traces_fail_closed(self):
        with self.assertRaises(EngineFailure) as no_movement:
            process(payload([0.0] * 20))
        self.assertEqual(no_movement.exception.code, "NO_VALID_REPETITION")

        with self.assertRaises(EngineFailure) as partial:
            process(payload([0.0, 0.0, 0.0, 0.1, 0.1, 0.1, 0.1, 0.0, 0.0]))
        self.assertEqual(partial.exception.code, "PARTIAL_REPETITION")

        with self.assertRaises(EngineFailure) as wrong_preroll:
            process(payload([0.1, 0.1, 0.1, 0.1, -0.1, -0.1, -0.1, -0.1, 0.0, 0.0, 0.0]))
        self.assertEqual(wrong_preroll.exception.code, "PARTIAL_REPETITION")

    def test_subthreshold_noise_and_unknown_band_are_not_silently_repaired(self):
        values = [
            0.0,
            0.0,
            0.0,
            0.1,
            0.1,
            0.1,
            0.1,
            0.0,
            0.03,
            -0.1,
            -0.1,
            -0.1,
            -0.1,
            0.0,
            0.0,
            0.0,
        ]
        with self.assertRaises(EngineFailure) as ambiguous:
            process(payload(values))
        self.assertEqual(ambiguous.exception.code, "SEGMENTATION_AMBIGUOUS")

        subthreshold = [0.0, 0.0, 0.0, 0.04, 0.04, 0.04, 0.04, 0.0, 0.0, 0.0, 0.0]
        with self.assertRaises(EngineFailure) as no_valid:
            process(payload(subthreshold))
        self.assertEqual(no_valid.exception.code, "SEGMENTATION_AMBIGUOUS")

    def test_timebase_lineage_and_configuration_failures_are_structured(self):
        irregular = payload(two_repetitions())
        irregular["samples"][4]["time_s"] = 0.45
        with self.assertRaises(EngineFailure) as irregular_error:
            process(irregular)
        self.assertEqual(irregular_error.exception.code, "IRREGULAR_TIMEBASE_UNSUPPORTED")

        missing = payload(two_repetitions())
        missing["samples"][5]["sample_index"] = 6
        with self.assertRaises(EngineFailure) as missing_error:
            process(missing)
        self.assertEqual(missing_error.exception.code, "MISSING_SAMPLE_UNSUPPORTED")

        unqualified = payload(two_repetitions())
        unqualified["sci2_lineage"]["qualification"]["status"] = "NOT_QUALIFIED"
        with self.assertRaises(EngineFailure) as qualification_error:
            process(unqualified)
        self.assertEqual(qualification_error.exception.code, "PROTOCOL_INCOMPATIBLE")

        filtered = payload(two_repetitions())
        filtered["configuration"]["filtering"] = "MOVING_AVERAGE"
        with self.assertRaises(EngineFailure) as filtering_error:
            process(filtered)
        self.assertEqual(filtering_error.exception.code, "UNSUPPORTED_CONFIGURATION")

        wrong_protocol = copy.deepcopy(payload(two_repetitions()))
        wrong_protocol["protocol"]["expected_phase_sequence"][0]["phase_id"] = "missing-phase"
        with self.assertRaises(EngineFailure) as protocol_error:
            process(wrong_protocol)
        self.assertEqual(protocol_error.exception.code, "PHASE_DEFINITION_MISSING")

    def test_sampling_variation_preserves_the_declared_sample_boundary_semantics(self):
        sampling_payload = payload(two_repetitions(), step=0.05)
        sampling_payload["configuration"]["minimum_repetition_duration_s"] = 0.4
        result = process(sampling_payload)
        self.assertEqual(result["status"], "SUCCEEDED")
        self.assertEqual(len(result["repetitions"]), 2)
        self.assertEqual(result["uncertainty"]["temporal_resolution_s"], 0.05)
        self.assertEqual(
            result["uncertainty"]["sampling_resolution"],
            "DECLARED_TIMEBASE_STEP_NOT_UNCERTAINTY",
        )


if __name__ == "__main__":
    unittest.main()
