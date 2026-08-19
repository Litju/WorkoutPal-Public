"use client";

import { useForm } from "@tanstack/react-form";
import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type SurfaceDensity = "comfortable" | "compact";

export interface SurfaceViewSettings {
  readonly density: SurfaceDensity;
  readonly showProvenance: boolean;
}

const defaultSettings: SurfaceViewSettings = {
  density: "comfortable",
  showProvenance: true,
};

export function SurfaceInspector({
  initialSettings = defaultSettings,
  onApply,
  surfaceId,
}: {
  readonly initialSettings?: SurfaceViewSettings;
  readonly onApply?: (settings: SurfaceViewSettings) => void;
  readonly surfaceId: string;
}) {
  const [open, setOpen] = useState(false);
  const form = useForm({
    defaultValues: initialSettings,
    onSubmit: async ({ value }) => {
      onApply?.(value);
      setOpen(false);
    },
  });

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={
          <Button aria-label="Open view settings" size="sm" variant="outline" />
        }
      >
        <SlidersHorizontal aria-hidden="true" />
        View settings
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>View settings</DialogTitle>
          <DialogDescription>
            Adjust presentation for {surfaceId}. These controls change the local
            view only; they do not change stored records.
          </DialogDescription>
        </DialogHeader>
        <form
          className="wp-inspector-form"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field name="density">
            {(field) => (
              <label className="wp-inspector-field">
                <span>Density</span>
                <select
                  aria-label="View density"
                  name={field.name}
                  onChange={(event) =>
                    field.handleChange(event.target.value as SurfaceDensity)
                  }
                  value={field.state.value}
                >
                  <option value="comfortable">Comfortable</option>
                  <option value="compact">Compact</option>
                </select>
              </label>
            )}
          </form.Field>
          <form.Field name="showProvenance">
            {(field) => (
              <label className="wp-inspector-check">
                <input
                  checked={field.state.value}
                  name={field.name}
                  onChange={(event) => field.handleChange(event.target.checked)}
                  type="checkbox"
                />
                <span>Show source and provenance notes</span>
              </label>
            )}
          </form.Field>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="ghost" />}>
              Cancel
            </DialogClose>
            <Button type="submit">Apply view</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
