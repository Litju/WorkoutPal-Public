"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { HomeScreen } from "./f2-client";
import { F3TrainingDesignScreen } from "./f3-client";
import { F4TrainingExecutionScreen } from "./f4-client";
import { F5MonitoringScreen } from "./f5-client";
import {
  ProductExperienceScreen,
  SharedStateSurface,
} from "./product-experience";
import {
  parseRouteContext,
  type RouteContext,
  validateRouteContext,
} from "./route-context";

function FirstAthleteRouteInner() {
  const searchParams = useSearchParams();
  const workspaceId = searchParams.get("workspaceId");
  if (workspaceId !== null && workspaceId.length > 0) {
    const routeContext = parseRouteContext({ workspaceId });
    if (routeContext === null) return <SharedStateSurface state="ERROR" />;
    return (
      <ProductExperienceScreen
        routeContext={routeContext}
        surfaceId="AUTH-03"
        workspaceId={workspaceId}
      />
    );
  }
  return <HomeScreen />;
}

function FirstAthleteRoute() {
  return (
    <Suspense fallback={<HomeScreen />}>
      <FirstAthleteRouteInner />
    </Suspense>
  );
}

export function RouteScreen({
  surfaceId,
  ...rawContext
}: RouteContext & { readonly surfaceId: string }) {
  const routeContext = validateRouteContext(surfaceId, rawContext);
  if (
    routeContext === null &&
    surfaceId !== "AUTH-02" &&
    surfaceId !== "AUTH-03"
  )
    return <SharedStateSurface state="ERROR" />;

  const workspaceId = routeContext?.workspaceId;
  const athleteId = routeContext?.athleteId;
  if (surfaceId === "AUTH-02") return <HomeScreen />;
  if (surfaceId === "AUTH-03") return <FirstAthleteRoute />;
  if (surfaceId.startsWith("STA-")) {
    const state =
      surfaceId === "STA-01"
        ? "EMPTY"
        : surfaceId === "STA-02"
          ? "ERROR"
          : surfaceId === "STA-03"
            ? "CONFLICT"
            : "UNAUTHORIZED";
    return <SharedStateSurface state={state} />;
  }
  if (workspaceId === undefined) return <HomeScreen />;
  if (surfaceId.startsWith("TRN-") && athleteId !== undefined) {
    return (
      <F3TrainingDesignScreen
        athleteId={athleteId}
        routeContext={routeContext ?? undefined}
        workspaceId={workspaceId}
      />
    );
  }
  if (surfaceId.startsWith("EXE-") && athleteId !== undefined) {
    return (
      <F4TrainingExecutionScreen
        athleteId={athleteId}
        routeContext={routeContext ?? undefined}
        workspaceId={workspaceId}
      />
    );
  }
  if (surfaceId.startsWith("MON-") && athleteId !== undefined) {
    return (
      <F5MonitoringScreen
        athleteId={athleteId}
        routeContext={routeContext ?? undefined}
        workspaceId={workspaceId}
      />
    );
  }
  return (
    <ProductExperienceScreen
      athleteId={athleteId}
      routeContext={routeContext ?? undefined}
      surfaceId={surfaceId}
      workspaceId={workspaceId}
    />
  );
}
