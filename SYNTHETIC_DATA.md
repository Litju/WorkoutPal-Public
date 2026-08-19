# Synthetic demonstration data

`pnpm demo:seed` provisions a fictional local workspace so the complete
application can be inspected without private data. It creates demonstration
accounts, athletes, movements, training plans, sessions, completed execution,
monitoring/history facts, assessment trials, velocity observations, and
strength-test observations.

Every name, identifier, measurement, load, velocity, timestamp, and credential
created by the seed is demonstration data. It is not a customer, athlete, team,
clinical, or production record. Delete and recreate the local PostgreSQL volume
when a clean demo is required:

```sh
pnpm db:down
pnpm db:start
pnpm db:migrate
pnpm db:provision-runtime
pnpm demo:seed
```
