"use client";

import { useId } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface ProductTrendPoint {
  readonly label: string;
  readonly value: number;
}

export function ProductTrendChart({
  data,
  description,
  title,
  unit,
}: {
  readonly data: readonly ProductTrendPoint[];
  readonly description: string;
  readonly title: string;
  readonly unit: string;
}) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="wp-chart-card">
      <div className="wp-chart-card-header">
        <div>
          <p className="wp-overline">Stored product facts</p>
          <h2 id={titleId}>{title}</h2>
          <p>{description}</p>
        </div>
        <span className="wp-chart-unit">Unit · {unit}</span>
      </div>
      {data.length === 0 ? (
        <p className="wp-chart-empty">No stored points in this window.</p>
      ) : (
        <>
          <div
            aria-label={`${title}, measured in ${unit}`}
            className="wp-chart"
            role="img"
          >
            <ResponsiveContainer height={210} width="100%">
              <LineChart
                data={data}
                margin={{ bottom: 4, left: 0, right: 12, top: 8 }}
              >
                <CartesianGrid
                  stroke="var(--wp-chart-grid)"
                  strokeDasharray="3 3"
                />
                <XAxis
                  dataKey="label"
                  stroke="var(--wp-text-muted)"
                  tick={{ fill: "var(--wp-text-muted)", fontSize: 11 }}
                />
                <YAxis
                  allowDecimals={false}
                  stroke="var(--wp-text-muted)"
                  tick={{ fill: "var(--wp-text-muted)", fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--wp-bg-raised)",
                    border: "1px solid var(--wp-border-strong)",
                    borderRadius: "8px",
                    color: "var(--wp-text)",
                  }}
                  formatter={(value) => [
                    `${String(value ?? "—")} ${unit}`,
                    "Stored",
                  ]}
                />
                <Line
                  activeDot={{ r: 4 }}
                  dataKey="value"
                  dot={{ fill: "var(--wp-accent)", r: 3 }}
                  stroke="var(--wp-accent)"
                  strokeWidth={2}
                  type="monotone"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <details className="wp-chart-data-details">
            <summary>View stored data table</summary>
            <div className="wp-chart-data-table-wrap">
              <table className="wp-chart-data-table">
                <caption className="sr-only">
                  {title} data, measured in {unit}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Period</th>
                    <th scope="col">Value ({unit})</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((point) => (
                    <tr key={point.label}>
                      <th scope="row">{point.label}</th>
                      <td>{point.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
