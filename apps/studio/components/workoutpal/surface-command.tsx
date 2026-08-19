"use client";

import {
  Activity,
  CalendarDays,
  FileText,
  History,
  type LucideIcon,
  Search,
  Settings2,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

interface SurfaceCommandPaletteProps {
  readonly athleteId: string | undefined;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
  readonly workspaceId: string;
}

interface SurfaceCommand {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly href: string;
}

export function SurfaceCommandPalette({
  athleteId,
  onOpenChange,
  open,
  workspaceId,
}: SurfaceCommandPaletteProps) {
  const router = useRouter();
  const resolvedAthleteId = athleteId === "new" ? undefined : athleteId;
  const athleteRoot =
    resolvedAthleteId === undefined
      ? `/workspace/${workspaceId}/athletes`
      : `/workspace/${workspaceId}/athletes/${resolvedAthleteId}`;
  const athleteScopedCommands =
    resolvedAthleteId === undefined
      ? []
      : [
          {
            icon: CalendarDays,
            label: "Open calendar",
            href: `${athleteRoot}/calendar/week`,
          },
          {
            icon: Target,
            label: "Open training",
            href: `${athleteRoot}/training`,
          },
          {
            icon: Activity,
            label: "Open assessments",
            href: `${athleteRoot}/assessments`,
          },
          {
            icon: Sparkles,
            label: "Open monitoring",
            href: `${athleteRoot}/monitoring`,
          },
        ];
  const commands: readonly SurfaceCommand[] = [
    {
      icon: Search,
      label: "Search workspace",
      href: `/workspace/${workspaceId}/search`,
    },
    { icon: Users, label: "Open athletes", href: athleteRoot },
    ...athleteScopedCommands,
    {
      icon: FileText,
      label: "Open reports",
      href: `/workspace/${workspaceId}/reports`,
    },
    {
      icon: History,
      label: "Open history",
      href: `/workspace/${workspaceId}/history`,
    },
    {
      icon: Settings2,
      label: "Open settings",
      href: `/workspace/${workspaceId}/settings`,
    },
  ];

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  return (
    <CommandDialog
      description="Move through the current WorkoutPal workspace."
      onOpenChange={onOpenChange}
      open={open}
      title="Search WorkoutPal"
    >
      <Command>
        <CommandInput placeholder="Jump to a workspace surface…" />
        <CommandList>
          <CommandEmpty>No matching surface.</CommandEmpty>
          <CommandGroup heading="Workspace surfaces">
            {commands.slice(0, 2).map((command) => {
              const Icon = command.icon;
              return (
                <CommandItem
                  key={command.label}
                  onSelect={() => go(command.href)}
                  value={command.label}
                >
                  <Icon />
                  <span>{command.label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Product areas">
            {commands.slice(2).map((command) => {
              const Icon = command.icon;
              return (
                <CommandItem
                  key={command.label}
                  onSelect={() => go(command.href)}
                  value={command.label}
                >
                  <Icon />
                  <span>{command.label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
