import importlib.util
import sys
import unittest
from pathlib import Path


class HostedSegmentationLoaderTests(unittest.TestCase):
    def test_loader_registers_dataclass_engine_module_before_execution(self):
        adapter_path = Path(__file__).with_name("science_segmentation.py")
        spec = importlib.util.spec_from_file_location(
            "workoutpal_hosted_science_segmentation_test", adapter_path
        )
        if spec is None or spec.loader is None:
            self.fail("Could not create hosted adapter import spec.")
        module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = module
        spec.loader.exec_module(module)
        self.assertEqual(
            module.ENGINE.PROCESSOR_ID,
            "resistance_training.segment_repetitions_from_kinematics",
        )


if __name__ == "__main__":
    unittest.main()
