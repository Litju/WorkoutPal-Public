"use client";

import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  type SortingState,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef, useState } from "react";

export interface FactualTableRow {
  readonly detail: string;
  readonly label: string;
  readonly status: string;
  readonly value: string;
}

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
});
const columnHelper = createColumnHelper<typeof features, FactualTableRow>();
const columns = columnHelper.columns([
  columnHelper.accessor("label", { header: "Fact" }),
  columnHelper.accessor("value", { header: "Value" }),
  columnHelper.accessor("detail", { header: "Context" }),
  columnHelper.accessor("status", { header: "Status" }),
]);

export function FactualTable({
  caption,
  rows,
}: {
  readonly caption: string;
  readonly rows: readonly FactualTableRow[];
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const data = useMemo(() => rows, [rows]);
  const table = useTable({
    columns,
    data,
    enableSorting: true,
    features,
    onSortingChange: setSorting,
    state: { sorting },
  });
  const rowModel = table.getRowModel();
  const shouldVirtualize = rowModel.rows.length > 50;
  const rowVirtualizer = useVirtualizer({
    count: rowModel.rows.length,
    estimateSize: () => 48,
    getScrollElement: () => parentRef.current,
    overscan: 6,
  });

  return (
    <section
      aria-label={caption}
      className="wp-factual-table"
      ref={parentRef}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: The table viewport is a keyboard-scrollable region.
      tabIndex={0}
    >
      <table className="wp-factual-table-grid">
        <caption className="sr-only">{caption}</caption>
        <thead className="wp-factual-table-head">
          <tr>
            {table.getHeaderGroups()[0]?.headers.map((header) => {
              const column = header.column;
              const sorted = column.getIsSorted();
              const ariaSort =
                sorted === "asc"
                  ? "ascending"
                  : sorted === "desc"
                    ? "descending"
                    : "none";
              return (
                <th aria-sort={ariaSort} key={header.id} scope="col">
                  {header.isPlaceholder ? null : (
                    <button
                      aria-label={`Sort by ${String(header.column.columnDef.header)}`}
                      className="wp-factual-table-sort"
                      disabled={!column.getCanSort()}
                      onClick={column.getToggleSortingHandler()}
                      type="button"
                    >
                      <table.FlexRender header={header} />
                      <span aria-hidden="true">
                        {sorted === "asc" ? "↑" : sorted === "desc" ? "↓" : "↕"}
                      </span>
                    </button>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody
          className={`wp-factual-table-body ${shouldVirtualize ? "is-virtualized" : ""}`}
          style={
            shouldVirtualize
              ? { height: `${rowVirtualizer.getTotalSize()}px` }
              : undefined
          }
        >
          {(shouldVirtualize
            ? rowVirtualizer.getVirtualItems().map((virtualRow) => ({
                index: virtualRow.index,
                row: rowModel.rows[virtualRow.index],
                style: { transform: `translateY(${virtualRow.start}px)` },
                virtual: true,
              }))
            : rowModel.rows.map((row, index) => ({
                index,
                row,
                style: undefined,
                virtual: false,
              }))
          ).map((item) => {
            if (item.row === undefined) return null;
            return (
              <tr
                className="wp-factual-table-row"
                data-index={item.index}
                key={item.row.id}
                ref={item.virtual ? rowVirtualizer.measureElement : undefined}
                style={item.style}
              >
                {item.row.getAllCells().map((cell) => (
                  <td key={cell.id}>
                    <table.FlexRender cell={cell} />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 ? (
        <p className="wp-factual-table-empty">No stored facts in this view.</p>
      ) : null}
    </section>
  );
}
