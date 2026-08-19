import type { ReactNode } from "react";

export function StudioShell({ children }: { readonly children: ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-8 py-5">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300">
          WorkoutPal
        </p>
        <h1 className="mt-2 text-2xl font-semibold">Studio foundation</h1>
      </header>
      <div className="mx-auto max-w-6xl px-8 py-10">{children}</div>
    </main>
  );
}

export function FoundationNotice() {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
      <p className="text-sm font-medium text-cyan-300">
        F1 repository and toolchain foundation
      </p>
      <p className="mt-3 max-w-2xl text-slate-300">
        The Studio shell is wired to the frozen WorkoutPal boundaries. Product
        workflows and scientific computation are intentionally not implemented
        in this foundation release.
      </p>
    </section>
  );
}
