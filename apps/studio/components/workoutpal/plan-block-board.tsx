"use client";

import { DragDropProvider } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import { useEffect, useState } from "react";

export interface PlanBlock {
  readonly detail: string;
  readonly id: string;
  readonly label: string;
}

function move<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item === undefined) return next;
  next.splice(to, 0, item);
  return next;
}

function SortableBlock({
  block,
  index,
  isLast,
  onMoveDown,
  onMoveUp,
}: {
  readonly block: PlanBlock;
  readonly index: number;
  readonly isLast: boolean;
  readonly onMoveDown: () => void;
  readonly onMoveUp: () => void;
}) {
  const { isDragSource, ref, handleRef } = useSortable({
    id: block.id,
    index,
  });
  return (
    <li
      className={`wp-plan-block ${isDragSource ? "is-dragging" : ""}`}
      ref={ref}
    >
      <button
        aria-label={`Reorder ${block.label}`}
        className="wp-plan-block-handle"
        ref={handleRef}
        type="button"
      >
        <GripVertical aria-hidden="true" size={16} />
      </button>
      <span>
        <strong>{block.label}</strong>
        <small>{block.detail}</small>
      </span>
      <span className="wp-plan-block-actions">
        <button
          aria-label={`Move ${block.label} up`}
          className="wp-plan-block-action"
          disabled={index === 0}
          onClick={onMoveUp}
          title={`Move ${block.label} up`}
          type="button"
        >
          <ChevronUp aria-hidden="true" size={15} />
        </button>
        <button
          aria-label={`Move ${block.label} down`}
          className="wp-plan-block-action"
          disabled={isLast}
          onClick={onMoveDown}
          title={`Move ${block.label} down`}
          type="button"
        >
          <ChevronDown aria-hidden="true" size={15} />
        </button>
      </span>
    </li>
  );
}

export function PlanBlockBoard({
  blocks,
  onReorder,
}: {
  readonly blocks: readonly PlanBlock[];
  readonly onReorder?: (blocks: readonly PlanBlock[]) => void;
}) {
  const [orderedBlocks, setOrderedBlocks] =
    useState<readonly PlanBlock[]>(blocks);

  useEffect(() => setOrderedBlocks(blocks), [blocks]);

  function moveBy(index: number, offset: number) {
    const target = index + offset;
    if (target < 0 || target >= orderedBlocks.length) return;
    const next = move(orderedBlocks, index, target);
    setOrderedBlocks(next);
    onReorder?.(next);
  }

  return (
    <DragDropProvider
      onDragEnd={(event) => {
        if (event.canceled) return;
        const source = event.operation.source?.id;
        const target = event.operation.target?.id;
        if (source === undefined || target === undefined || source === target)
          return;
        const from = orderedBlocks.findIndex((block) => block.id === source);
        const to = orderedBlocks.findIndex((block) => block.id === target);
        if (from < 0 || to < 0) return;
        const next = move(orderedBlocks, from, to);
        setOrderedBlocks(next);
        onReorder?.(next);
      }}
    >
      <ol aria-label="Training blocks" className="wp-plan-block-list">
        {orderedBlocks.map((block, index) => (
          <SortableBlock
            block={block}
            index={index}
            isLast={index === orderedBlocks.length - 1}
            key={block.id}
            onMoveDown={() => moveBy(index, 1)}
            onMoveUp={() => moveBy(index, -1)}
          />
        ))}
      </ol>
      <p className="wp-component-note">
        Reordering changes the local draft order only until the owning workflow
        explicitly saves it.
      </p>
    </DragDropProvider>
  );
}
