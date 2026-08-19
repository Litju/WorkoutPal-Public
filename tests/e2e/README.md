# E2E harness

Playwright covers the public functional port with browser journeys for
authentication, workspace and athlete management, training design, session
execution, monitoring, assessments, agent read paths, and scientific routes.

For a local app already running on port 3000, run:

```sh
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 pnpm exec playwright test
```

Without `PLAYWRIGHT_BASE_URL`, the configuration starts the Eve runtime and a
Next.js preview server on ports 4274 and 3001.
