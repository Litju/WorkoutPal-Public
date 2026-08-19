"use client";

import type { Config, Data, Layout } from "plotly.js";
import { useEffect, useRef } from "react";
import type {
  ScientificPlotMetadata,
  ScientificPlotPoint,
} from "./scientific-plot";

export function ScientificPlotClient({
  metadata,
  method,
  points,
}: {
  readonly metadata: ScientificPlotMetadata;
  readonly method: string;
  readonly points: readonly ScientificPlotPoint[];
}) {
  const plotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void import("plotly.js/dist/plotly-basic").then(({ default: plotly }) => {
      if (cancelled || plotRef.current === null) return;
      const styles = window.getComputedStyle(plotRef.current);
      const axisColor =
        styles.getPropertyValue("--wp-text-muted").trim() || "#7b91aa";
      const gridColor =
        styles.getPropertyValue("--wp-chart-grid").trim() || "#20344d";
      const lineColor =
        styles.getPropertyValue("--wp-accent").trim() || "#63d9e6";
      const trace: Data = {
        line: { color: lineColor, width: 2 },
        mode: "lines+markers",
        type: "scatter",
        x: points.map((point) => point.x),
        y: points.map((point) => point.y),
      };
      const layout: Partial<Layout> = {
        autosize: true,
        margin: { b: 38, l: 48, r: 18, t: 18 },
        paper_bgcolor: "transparent",
        plot_bgcolor: "transparent",
        xaxis: {
          title: { text: metadata.axis },
          color: axisColor,
          gridcolor: gridColor,
        },
        yaxis: {
          color: axisColor,
          gridcolor: gridColor,
          title: { text: metadata.displayUnit },
        },
      };
      const config: Partial<Config> = {
        displayModeBar: false,
        responsive: true,
      };
      void plotly.newPlot(plotRef.current, [trace], layout, config);
    });
    return () => {
      cancelled = true;
      if (plotRef.current !== null) {
        void import("plotly.js/dist/plotly-basic").then(
          ({ default: plotly }) => {
            if (plotRef.current !== null) plotly.purge(plotRef.current);
          },
        );
      }
    };
  }, [metadata, points]);

  return (
    <div className="wp-scientific-plot-wrap">
      <div
        aria-label={`Scientific plot using ${method}; ${metadata.construct}; ${metadata.displayUnit}`}
        className="wp-scientific-plot"
        ref={plotRef}
        role="img"
      />
      <p className="wp-component-note">
        Method · {method} · units · {metadata.displayUnit}
      </p>
      <details className="wp-chart-data-details">
        <summary>View scientific data table</summary>
        <div className="wp-chart-data-table-wrap">
          <table className="wp-chart-data-table">
            <caption className="sr-only">
              Scientific data for {metadata.construct}; values in{" "}
              {metadata.displayUnit}
            </caption>
            <thead>
              <tr>
                <th scope="col">{metadata.axis}</th>
                <th scope="col">Value ({metadata.displayUnit})</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={`${point.x}-${point.y}`}>
                  <th scope="row">{point.x}</th>
                  <td>{point.y}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
