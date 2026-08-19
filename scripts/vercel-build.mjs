import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const packageManager = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const hostedEngineSource = fileURLToPath(
  new URL(
    "../packages/science-port/engine/velocity_processor.py",
    import.meta.url,
  ),
);
const hostedEngineArtifact = fileURLToPath(
  new URL("../apps/studio/api/_velocity_processor.py", import.meta.url),
);
const hostedSegmentationSource = fileURLToPath(
  new URL(
    "../packages/science-port/engine/segmentation_processor.py",
    import.meta.url,
  ),
);
const hostedSegmentationArtifact = fileURLToPath(
  new URL("../apps/studio/api/_segmentation_processor.py", import.meta.url),
);
const hostedRepPhaseMetricsSource = fileURLToPath(
  new URL(
    "../packages/science-port/engine/rep_phase_kinematic_metrics_processor.py",
    import.meta.url,
  ),
);
const hostedRepPhaseMetricsArtifact = fileURLToPath(
  new URL(
    "../apps/studio/api/_rep_phase_kinematic_metrics_processor.py",
    import.meta.url,
  ),
);
const hostedSetVelocityStateSource = fileURLToPath(
  new URL(
    "../packages/science-port/engine/set_level_vbt_processor.py",
    import.meta.url,
  ),
);
const hostedSetVelocityStateArtifact = fileURLToPath(
  new URL("../apps/studio/api/_set_level_vbt_processor.py", import.meta.url),
);
const hostedLoadVelocityProfileSource = fileURLToPath(
  new URL(
    "../packages/science-port/engine/load_velocity_profile_processor.py",
    import.meta.url,
  ),
);
const hostedLoadVelocityProfileArtifact = fileURLToPath(
  new URL(
    "../apps/studio/api/_load_velocity_profile_processor.py",
    import.meta.url,
  ),
);
const hostedMaximalStrengthSource = fileURLToPath(
  new URL(
    "../packages/science-port/engine/maximal_strength_processor.py",
    import.meta.url,
  ),
);
const hostedMaximalStrengthArtifact = fileURLToPath(
  new URL("../apps/studio/api/_maximal_strength_processor.py", import.meta.url),
);
const hostedMaximalStrengthDigestArtifact = fileURLToPath(
  new URL(
    "../apps/studio/api/_maximal_strength_processor.py.sha256",
    import.meta.url,
  ),
);
const hostedSignalMechanicsSource = fileURLToPath(
  new URL(
    "../packages/science-port/engine/scientific_signal_mechanics_processor.py",
    import.meta.url,
  ),
);
const hostedSignalMechanicsArtifact = fileURLToPath(
  new URL(
    "../apps/studio/api/_scientific_signal_mechanics_processor.py",
    import.meta.url,
  ),
);
const hostedSignalMechanicsDigestArtifact = fileURLToPath(
  new URL(
    "../apps/studio/api/_scientific_signal_mechanics_processor.py.sha256",
    import.meta.url,
  ),
);

mkdirSync(fileURLToPath(new URL("../apps/studio/api/", import.meta.url)), {
  recursive: true,
});
copyFileSync(hostedEngineSource, hostedEngineArtifact);
copyFileSync(hostedSegmentationSource, hostedSegmentationArtifact);
copyFileSync(hostedRepPhaseMetricsSource, hostedRepPhaseMetricsArtifact);
copyFileSync(hostedSetVelocityStateSource, hostedSetVelocityStateArtifact);
copyFileSync(
  hostedLoadVelocityProfileSource,
  hostedLoadVelocityProfileArtifact,
);
copyFileSync(hostedMaximalStrengthSource, hostedMaximalStrengthArtifact);
writeFileSync(
  hostedMaximalStrengthDigestArtifact,
  `${createHash("sha256").update(readFileSync(hostedMaximalStrengthArtifact)).digest("hex")}\n`,
  "utf8",
);
copyFileSync(hostedSignalMechanicsSource, hostedSignalMechanicsArtifact);
writeFileSync(
  hostedSignalMechanicsDigestArtifact,
  `${createHash("sha256").update(readFileSync(hostedSignalMechanicsArtifact)).digest("hex")}\n`,
  "utf8",
);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    shell: process.platform === "win32",
    stdio: "inherit",
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (
  process.env.VERCEL_ENV === "preview" &&
  process.env.WORKOUTPAL_PREVIEW_MIGRATE === "1"
) {
  run(packageManager, ["db:migrate"]);
}

run(packageManager, ["build"]);
