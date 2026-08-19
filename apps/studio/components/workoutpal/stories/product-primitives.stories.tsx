import type { Meta, StoryObj } from "@storybook/react";
import { Activity } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FactualTable, type FactualTableRow } from "../factual-table";
import { type PlanBlock, PlanBlockBoard } from "../plan-block-board";
import { ProductTrendChart } from "../product-trend-chart";
import { ScientificPlot } from "../scientific-plot";
import {
  SurfaceInspector,
  type SurfaceViewSettings,
} from "../surface-inspector";

const factualRows: readonly FactualTableRow[] = [
  {
    detail: "Fixture row · source record: audit-001",
    label: "Session published",
    status: "Recorded",
    value: "plan-001",
  },
  {
    detail: "Fixture row · source record: audit-002",
    label: "Assessment amended",
    status: "Recorded",
    value: "assessment-004",
  },
];

const planBlocks: readonly PlanBlock[] = [
  {
    detail: "Fixture draft · local order only",
    id: "warm-up",
    label: "Warm-up",
  },
  {
    detail: "Fixture draft · local order only",
    id: "strength",
    label: "Strength",
  },
  {
    detail: "Fixture draft · local order only",
    id: "cool-down",
    label: "Cool-down",
  },
];

function InspectorFixture() {
  const [settings, setSettings] = useState<SurfaceViewSettings>({
    density: "comfortable",
    showProvenance: true,
  });
  return (
    <div>
      <SurfaceInspector
        initialSettings={settings}
        onApply={setSettings}
        surfaceId="STORY-01"
      />
      <p className="wp-component-note">
        Applied locally · {settings.density} density · provenance
        {settings.showProvenance ? " visible" : " hidden"}
      </p>
    </div>
  );
}

const meta = {
  title: "Product primitives",
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const States: Story = {
  render: () => (
    <main className="wp-auth-shell" data-theme="dark">
      <div className="wp-story-grid">
        <section className="wp-story-card">
          <p className="wp-overline">Base UI + shadcn</p>
          <h1>Bounded controls</h1>
          <p className="wp-story-copy">
            A compact action row with a local inspector and a visible state
            boundary.
          </p>
          <div className="wp-story-actions">
            <Button>
              <Activity aria-hidden="true" />
              Primary action
            </Button>
            <InspectorFixture />
          </div>
        </section>
        <section className="wp-story-card">
          <FactualTable caption="Story factual table" rows={factualRows} />
        </section>
        <section className="wp-story-card">
          <PlanBlockBoard blocks={planBlocks} />
        </section>
        <section className="wp-story-card">
          <ProductTrendChart
            data={[
              { label: "Mon", value: 1 },
              { label: "Wed", value: 0 },
              { label: "Fri", value: 1 },
            ]}
            description="Fixture data used only to exercise the chart state."
            title="Stored linkage fixture"
            unit="records"
          />
        </section>
        <section className="wp-story-card">
          <ScientificPlot
            method="SCI-3 synthetic fixture"
            metadata={{
              axis: "sample index",
              construct: "synthetic signal",
              direction: "positive fixture direction",
              displayUnit: "m/s",
              limitations:
                "Synthetic fixture only; not real-world validation or a clinical result.",
              objectSystem: "synthetic signal point",
              provenance: "Story fixture only",
              referenceFrame: "fixture coordinates",
              uncertainty: "UNKNOWN",
            }}
            points={[
              { x: 0, y: 0 },
              { x: 1, y: 0.6 },
              { x: 2, y: 0.2 },
            ]}
            qualification="REAL_WORLD_SEGMENTATION_VALIDATED=NO"
          />
        </section>
      </div>
    </main>
  ),
};
