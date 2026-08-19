"use client";

import dynamic from "next/dynamic";
import { useId } from "react";

export interface ScientificPlotPoint {
  readonly x: number;
  readonly y: number;
}

export interface ScientificPlotMetadata {
  readonly axis: string;
  readonly construct: string;
  readonly direction: string;
  readonly displayUnit: string;
  readonly limitations: string;
  readonly objectSystem: string;
  readonly provenance: string;
  readonly referenceFrame: string;
  readonly uncertainty: string;
}

const LazyScientificPlot = dynamic(
  () =>
    import("./scientific-plot-client").then(
      (module) => module.ScientificPlotClient,
    ),
  {
    loading: () => (
      <div className="wp-chart-empty">Loading scientific plot…</div>
    ),
    ssr: false,
  },
);

export function ScientificPlot({
  metadata,
  method,
  points,
  qualification,
}: {
  readonly metadata: ScientificPlotMetadata;
  readonly method: string;
  readonly points: readonly ScientificPlotPoint[];
  readonly qualification: string;
}) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="wp-chart-card">
      <div className="wp-chart-card-header">
        <div>
          <p className="wp-overline">Scientific adapter</p>
          <h2 id={titleId}>Qualified signal view</h2>
          <p>
            Presentation only; the processor and qualification contract remain
            authoritative.
          </p>
        </div>
        <span className="wp-chart-unit">{qualification}</span>
      </div>
      <dl className="wp-scientific-metadata">
        <div>
          <dt>Construct</dt>
          <dd>{metadata.construct}</dd>
        </div>
        <div>
          <dt>Object / system</dt>
          <dd>{metadata.objectSystem}</dd>
        </div>
        <div>
          <dt>Reference frame</dt>
          <dd>{metadata.referenceFrame}</dd>
        </div>
        <div>
          <dt>Axis / direction</dt>
          <dd>
            {metadata.axis} / {metadata.direction}
          </dd>
        </div>
        <div>
          <dt>Provenance</dt>
          <dd>{metadata.provenance}</dd>
        </div>
        <div>
          <dt>Uncertainty</dt>
          <dd>{metadata.uncertainty}</dd>
        </div>
        <div className="wp-scientific-metadata-wide">
          <dt>Limitations</dt>
          <dd>{metadata.limitations}</dd>
        </div>
      </dl>
      <LazyScientificPlot metadata={metadata} method={method} points={points} />
    </section>
  );
}
