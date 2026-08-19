import {
  type AssessmentApplication,
  createAssessmentApplication,
  createF2Application,
  createF3Application,
  createF4Application,
  createF5Application,
  createF7Application,
  createSearchApplication,
  type F2Application,
  type F3Application,
  type F4Application,
  type F5Application,
  type F7Application,
} from "@workoutpal/application";
import {
  type BetterAuthAdapter,
  createBetterAuthAdapter,
} from "@workoutpal/auth-better-auth";
import {
  createPostgresF2Persistence,
  type PostgresF2Persistence,
} from "@workoutpal/persistence-postgres";

interface WorkoutPalRuntime {
  readonly application: F2Application;
  readonly trainingDesign: F3Application;
  readonly execution: F4Application;
  readonly monitoring: F5Application;
  readonly agentOperations: F7Application;
  readonly assessments: AssessmentApplication;
  readonly search: ReturnType<typeof createSearchApplication>;
  readonly auth: BetterAuthAdapter;
  readonly persistence: PostgresF2Persistence;
}

declare global {
  // eslint-disable-next-line no-var
  var workoutPalRuntime: WorkoutPalRuntime | undefined;
}

export function getRuntime(): WorkoutPalRuntime {
  if (globalThis.workoutPalRuntime !== undefined)
    return globalThis.workoutPalRuntime;

  const persistence = createPostgresF2Persistence();
  const auth = createBetterAuthAdapter();
  const runtime = {
    persistence,
    auth,
    application: createF2Application(persistence),
    trainingDesign: createF3Application({
      transaction: persistence.f3Transaction,
    }),
    execution: createF4Application({
      transaction: persistence.f4Transaction,
    }),
    monitoring: createF5Application({
      transaction: persistence.f4Transaction,
    }),
    agentOperations: createF7Application({
      transaction: persistence.f7Transaction,
    }),
    assessments: createAssessmentApplication({
      transaction: persistence.psc4Transaction,
    }),
    search: createSearchApplication(persistence),
  } satisfies WorkoutPalRuntime;
  globalThis.workoutPalRuntime = runtime;
  return runtime;
}

export function requestId(request: Request): string {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}
