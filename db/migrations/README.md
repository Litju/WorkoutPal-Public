# F1 migrations

Migrations are reviewed SQL applied in lexical order by the persistence adapter harness. F1 creates
only the approved logical PostgreSQL namespaces; it does not invent domain tables before a vertical
slice owns them.

PSC1 adds forward-only migrations `0007` through `0010`. They establish transaction-local tenant
context, row-level security, explicit runtime-role grants, workspace-aware integrity triggers, and
workspace-scoped idempotency records. Migration `0010` keeps pre-PSC1 idempotency history nullable
and hidden from the runtime role while all new application writes carry a workspace ID.
The migration role is separate from the provisioned `workoutpal_runtime_login` application role.
