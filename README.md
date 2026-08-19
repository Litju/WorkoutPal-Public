# WorkoutPal

WorkoutPal is a full, source-available training operating system for coaches
and practitioners. This repository is the complete public functional port of
the current WorkoutPal application at the export snapshot. It preserves the
monorepo, Next.js studio, PostgreSQL persistence, Better Auth flow, agent
orchestration, domain packages, scientific contracts, Python numerical
processors, migrations, fixtures, and test suites.

**THIS PROJECT IS NOT OPEN SOURCE.**

The code is published for viewing, technical evaluation, and portfolio
demonstration under the restricted rights notice in [`LICENSE`](LICENSE).
No production secrets, private infrastructure values, customer data, or
private development history are included. The demo data is synthetic.

## What is included

- Next.js/React application shell, authentication, workspaces, athletes,
  movement library, training goals, plans, phases, sessions, execution,
  amendments, history, monitoring, reports, search, and settings.
- PostgreSQL schema and ordered migrations with tenant-safe persistence,
  Better Auth tables, RLS policies, and runtime-role provisioning.
- Agent conversation UI, authenticated read tools, typed product actions, and
  approval-gated proposal execution. Agent execution requires a provider key
  supplied by the operator.
- Real TypeScript scientific contracts and application routes plus the Python
  engines for velocity, repetition/phase metrics, segmentation, set-level VBT,
  load–velocity profiles, maximal-strength estimation, and signal mechanics.
- Existing unit, contract, architecture, integration, scientific, and browser
  tests from the exported application.
- A synthetic demo bootstrap covering a workspace, multiple athletes and
  movements, training plans and sessions, completed training, assessments,
  velocity observations, strength-test observations, and history.

## Run locally

Requirements: Node.js 24.15+, pnpm 11.1.1, Python 3.12, uv, and Docker.

```sh
git clone https://github.com/Litju/WorkoutPal-Public.git
cd WorkoutPal-Public
cp .env.example .env.local
cp .env.example apps/studio/.env.local
pnpm install --frozen-lockfile
uv sync --frozen
pnpm db:start
pnpm db:migrate
pnpm db:provision-runtime
pnpm build
pnpm dev
```

In a second terminal, after the app is running:

```sh
cd WorkoutPal-Public
pnpm demo:seed
```

Open `http://localhost:3000/sign-in`. The seeded demo account is controlled by
`WORKOUTPAL_DEMO_EMAIL` and `WORKOUTPAL_DEMO_PASSWORD` in `.env.local`; change
them before using a shared machine. These values are demonstration credentials
only and must never be reused in production.

The example `WORKOUTPAL_SOURCE_REVISION` is an all-zero synthetic revision for
local provenance. Set it to the deployed 40-character commit SHA in hosted
environments; a Vercel commit SHA takes precedence when supplied.

The agent panel is available without a provider key for the rest of the
application. To exercise the live agent flow, set `OPENCODE_GO_API_KEY` (or
configure the provider-compatible base URL and model) using credentials you
own and are entitled to use. No provider credential is bundled here.

## Verification

```sh
pnpm check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
uv run ruff format --check packages/science-port/engine apps/studio/api
uv run ruff check packages/science-port/engine apps/studio/api
uv run python -m mypy
uv run python -m unittest discover -s packages/science-port/engine -p "test_*.py"
```

The browser suite starts a local Eve runtime and Next.js preview server when
`PLAYWRIGHT_BASE_URL` is not set. A hosted scientific smoke is only valid when
the caller supplies a deployed URL, source revision, and the required external
credentials; local tests do not claim hosted qualification.

## Repository map

```text
apps/studio/                  Next.js product and API routes
packages/application/         application orchestration and contracts
packages/*/                   domain, auth, agent, monitoring, and UI packages
packages/science-port/        TypeScript ports and Python numerical authority
db/migrations/                PostgreSQL schema and tenancy migrations
scripts/demo/                 synthetic full-application provisioning
scripts/qualification/        database/runtime qualification utilities
tests/                        unit, contract, architecture, integration, and E2E tests
```

The implementation identifiers retain the technical names required by the
application. Private project-management receipts, agent transcripts, local
caches, production environment values, and private Git history are not part of
this repository.

## Rights

Copyright © 2026 Julio Rodriguez. All Rights Reserved.

See [`LICENSE`](LICENSE) for the complete source-available proprietary notice.
