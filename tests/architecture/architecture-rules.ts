import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export interface ArchitectureCheckResult {
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

const boundedContexts = new Set([
  "shared-kernel",
  "accounts",
  "athletes",
  "training-design",
  "training-execution",
  "assessments",
  "monitoring",
  "provenance",
  "agent-operations",
  "science-contract",
  "movement-science",
]);

const allowedGraph: Readonly<Record<string, readonly string[]>> = {
  "shared-kernel": [],
  accounts: ["shared-kernel"],
  athletes: ["shared-kernel"],
  "training-design": ["shared-kernel"],
  "training-execution": ["shared-kernel"],
  assessments: ["shared-kernel", "provenance"],
  monitoring: [
    "shared-kernel",
    "science-contract",
    "training-design",
    "training-execution",
  ],
  provenance: ["shared-kernel"],
  "agent-operations": [
    "shared-kernel",
    "accounts",
    "athletes",
    "training-design",
    "training-execution",
    "monitoring",
  ],
  "science-contract": ["shared-kernel"],
  "movement-science": ["shared-kernel", "science-contract"],
  application: [
    "shared-kernel",
    "accounts",
    "agent-operations",
    "athletes",
    "assessments",
    "provenance",
    "training-design",
    "training-execution",
    "monitoring",
  ],
  "persistence-postgres": [
    "shared-kernel",
    "application",
    "accounts",
    "athletes",
    "training-design",
    "training-execution",
    "assessments",
    "monitoring",
    "provenance",
    "agent-operations",
  ],
  "auth-better-auth": ["shared-kernel"],
  "agent-eve": ["agent-operations", "accounts"],
  ui: [],
  "science-port": ["shared-kernel", "science-contract", "movement-science"],
};

const packageNames = new Set([
  ...boundedContexts,
  "application",
  "persistence-postgres",
  "auth-better-auth",
  "agent-eve",
  "ui",
  "science-port",
]);

export const coreAndApplicationForbiddenPattern =
  /(?:^|["'/])(?:next|react|drizzle-orm|better-auth|zod|ai|eve|@ai-sdk\/|@tauri-apps\/|@vercel\/|vercel(?:\/|(?=["']))|python)/i;

export const scientificContractForbiddenPattern =
  /(?:^|["'/])(?:next|react|drizzle-orm|better-auth|zod|ai|eve|@ai-sdk\/|@tauri-apps\/|@vercel\/|vercel(?:\/|(?=["']))|pg|postgres|neon|fetch\s*\(|window\b|document\b)/i;

export function isScientificContractForbiddenImport(
  specifier: string,
): boolean {
  return (
    scientificContractForbiddenPattern.test(`"${specifier}"`) ||
    specifier !== "@workoutpal/shared-kernel"
  );
}

export function isMonitoringForbiddenImport(specifier: string): boolean {
  return (
    specifier === "@workoutpal/application" ||
    specifier === "@workoutpal/persistence-postgres" ||
    specifier === "@workoutpal/auth-better-auth" ||
    specifier === "@workoutpal/agent-eve"
  );
}

export function isAgentReadPathForbiddenImport(specifier: string): boolean {
  return [
    "@workoutpal/persistence-postgres",
    "drizzle-orm",
    "pg",
    "node:child_process",
    "node:fs",
    "node:fs/promises",
    "eve/sandbox",
  ].includes(specifier);
}

export function isAgentReadPathForbiddenSource(source: string): boolean {
  return /(?:run_sql|read_file|write_file|child_process|exec\s*\(|spawn\s*\(|shell\b|sandbox\b)/i.test(
    source,
  );
}

export function isAgentMutationToolForbiddenSource(source: string): boolean {
  return /(?:persistence-postgres|drizzle-orm|\bpg\b|node:fs|child_process|run_sql|write_file|json\s*patch|raw\s*sql|shell\b|sandbox\b|fetch\s*\()/i.test(
    source,
  );
}

const deliveryIgnoredDirectoryNames = new Set([
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
  "test-results",
]);

export function isDeliveryPrivateImport(specifier: string): boolean {
  return (
    /^@workoutpal\/[^/]+\//.test(specifier) ||
    /(?:^|[/\\])packages[/\\][^/\\]+[/\\]src(?:[/\\]|$)/.test(specifier)
  );
}

function implementationFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const fullPath = path.join(directory, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...implementationFiles(fullPath));
    } else if (
      (fullPath.endsWith(".ts") || fullPath.endsWith(".tsx")) &&
      !fullPath.includes("__tests__")
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

function deliveryImplementationFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && deliveryIgnoredDirectoryNames.has(entry.name)) {
      continue;
    }
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...deliveryImplementationFiles(fullPath));
    } else if (
      (fullPath.endsWith(".ts") || fullPath.endsWith(".tsx")) &&
      !fullPath.includes("__tests__")
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

function importsFrom(source: string): string[] {
  const imports: string[] = [];
  const importPattern =
    /(?:import|export)\s+(?:type\s+)?(?:[^"']*?\sfrom\s+)?["']([^"']+)["']/g;
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1];
    if (specifier !== undefined) {
      imports.push(specifier);
    }
  }
  for (const match of source.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) {
    const specifier = match[1];
    if (specifier !== undefined) {
      imports.push(specifier);
    }
  }
  return imports;
}

function packageFromSpecifier(specifier: string): string | null {
  const match = /^@workoutpal\/([^/]+)(?:\/.*)?$/.exec(specifier);
  const packageName = match?.[1];
  return packageName !== undefined && packageNames.has(packageName)
    ? packageName
    : null;
}

function hasCycle(
  graph: Readonly<Record<string, readonly string[]>>,
): string[] | null {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const pathStack: string[] = [];

  function visit(node: string): string[] | null {
    if (visiting.has(node)) {
      const start = pathStack.indexOf(node);
      return [...pathStack.slice(start), node];
    }
    if (visited.has(node)) {
      return null;
    }

    visiting.add(node);
    pathStack.push(node);
    for (const dependency of graph[node] ?? []) {
      const cycle = visit(dependency);
      if (cycle !== null) {
        return cycle;
      }
    }
    pathStack.pop();
    visiting.delete(node);
    visited.add(node);
    return null;
  }

  for (const node of Object.keys(graph)) {
    const cycle = visit(node);
    if (cycle !== null) {
      return cycle;
    }
  }
  return null;
}

export function evaluateArchitecture(
  repositoryRoot: string,
): ArchitectureCheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const importGraph: Record<string, string[]> = {};

  for (const packageName of packageNames) {
    importGraph[packageName] = [];
    const manifestPath = path.join(
      repositoryRoot,
      "packages",
      packageName,
      "package.json",
    );
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      exports?: Record<string, unknown>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    const declaredDependencies = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
    ]);
    const packageDirectory = path.join(
      repositoryRoot,
      "packages",
      packageName,
      "src",
    );
    for (const filePath of implementationFiles(packageDirectory)) {
      const source = readFileSync(filePath, "utf8");
      const relativeFile = path.relative(repositoryRoot, filePath);
      const isCore = boundedContexts.has(packageName);

      if (
        (isCore || packageName === "application") &&
        coreAndApplicationForbiddenPattern.test(source)
      ) {
        errors.push(
          `${relativeFile}: core package contains a forbidden framework/adapter/science dependency`,
        );
      }

      if (
        packageName === "science-contract" &&
        scientificContractForbiddenPattern.test(source)
      ) {
        errors.push(
          `${relativeFile}: scientific contracts contain a forbidden UI, infrastructure, or runtime dependency`,
        );
      }

      if (
        packageName === "monitoring" &&
        importsFrom(source).some(isMonitoringForbiddenImport)
      ) {
        errors.push(
          `${relativeFile}: monitoring read models must not import delivery or persistence adapters`,
        );
      }
      if (
        packageName === "agent-eve" &&
        /@workoutpal\/persistence-postgres|drizzle-orm|run_sql|write_file|shell/i.test(
          source,
        )
      ) {
        errors.push(
          `${relativeFile}: agent adapter has direct persistence or generic infrastructure authority`,
        );
      }
      if (
        /\b(?:numpy|scipy|fastapi|training[-_ ]load|e1rm|readiness\s+score|recovery\s+score|cardio[-_ ]zone|periodization\s+algorithm)\b/i.test(
          source,
        )
      ) {
        errors.push(
          `${relativeFile}: scientific implementation or foundation formula detected`,
        );
      }

      for (const specifier of importsFrom(source)) {
        if (specifier.startsWith("@workoutpal/")) {
          if (/^@workoutpal\/[^/]+\//.test(specifier)) {
            errors.push(
              `${relativeFile}: deep import is forbidden (${specifier})`,
            );
          }
          const dependency = packageFromSpecifier(specifier);
          if (dependency !== null && dependency !== packageName) {
            if (!importGraph[packageName]?.includes(dependency)) {
              importGraph[packageName]?.push(dependency);
            }
            if (!(allowedGraph[packageName] ?? []).includes(dependency)) {
              errors.push(
                `${relativeFile}: ${packageName} cannot import ${dependency}`,
              );
            }
            if (!declaredDependencies.has(`@workoutpal/${dependency}`)) {
              errors.push(
                `${relativeFile}: ${packageName} has an undeclared dependency on ${dependency}`,
              );
            }
          }
        }
      }
    }

    if (manifest.exports?.["."] === undefined) {
      errors.push(
        `${path.relative(repositoryRoot, manifestPath)}: public package export is missing`,
      );
    }
    if (
      !statSync(
        path.join(repositoryRoot, "packages", packageName, "src", "public.ts"),
        { throwIfNoEntry: false },
      ) &&
      !statSync(
        path.join(repositoryRoot, "packages", packageName, "src", "public.tsx"),
        { throwIfNoEntry: false },
      )
    ) {
      errors.push(
        `${path.relative(repositoryRoot, manifestPath)}: explicit public entry point is missing`,
      );
    }
  }

  const appsDirectory = path.join(repositoryRoot, "apps");
  if (statSync(appsDirectory, { throwIfNoEntry: false })) {
    for (const filePath of deliveryImplementationFiles(appsDirectory)) {
      const source = readFileSync(filePath, "utf8");
      const relativeFile = path.relative(repositoryRoot, filePath);
      for (const specifier of importsFrom(source)) {
        if (isDeliveryPrivateImport(specifier)) {
          errors.push(
            `${relativeFile}: delivery source must import public package entry points (${specifier})`,
          );
        }
      }
    }

    const studioAgentDirectory = path.join(appsDirectory, "studio", "agent");
    if (statSync(studioAgentDirectory, { throwIfNoEntry: false })) {
      for (const filePath of deliveryImplementationFiles(
        studioAgentDirectory,
      )) {
        const source = readFileSync(filePath, "utf8");
        const relativeFile = path.relative(repositoryRoot, filePath);
        if (isAgentReadPathForbiddenSource(source)) {
          errors.push(
            `${relativeFile}: F6 agent source contains generic infrastructure or sandbox authority`,
          );
        }
        if (importsFrom(source).some(isAgentReadPathForbiddenImport)) {
          errors.push(
            `${relativeFile}: F6 agent source imports persistence, process, or sandbox infrastructure`,
          );
        }
      }
    }
  }

  const cycle = hasCycle(importGraph);
  if (cycle !== null) {
    errors.push(
      `bounded-context dependency cycle detected: ${cycle.join(" -> ")}`,
    );
  }
  if (
    readdirSync(path.join(repositoryRoot, "packages")).some(
      (name) => name.toLowerCase() === "utils",
    )
  ) {
    errors.push("generic utils dumping ground is forbidden");
  }

  return { errors, warnings };
}
