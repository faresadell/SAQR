# Dependency updates (Dependabot review)

Reviewed on 2026-11-02 against `main` after the frontend wiring batches. Each pull request was brought up to date with `main` and run through the full CI (`npm ci`, generate, typecheck, lint, tests, migrations, build).

| PR | Update | Decision | Why |
|----|--------|----------|-----|
| #1 | actions/setup-node 4 → 7 | **Merged** | CI green. |
| #2 | actions/checkout 4 → 7 | **Applied by PR #22** | Dependabot's branch conflicted after #1; the same one-line change was made on top of `main`. |
| #4 | @prisma/client 6 → 7 | Left open | Major version. `npm ci` fails on the update branch, and a Prisma major version can change client generation and connection setup; it needs its own migration plan, with a rehearsal against a copy of the production database. `prisma` and `@prisma/client` must stay on the same major version. |
| #5 | eslint-config-next 15 → 16 | Left open | The project is on Next 15; the config version must follow the Next major version. Upgrade together with Next. |
| #6 | @types/node 22 → 26 | Left open | The runtime is Node 22; type definitions for Node 26 would allow APIs that do not exist at runtime. `npm ci` also fails on the update branch (cause not investigated). Revisit when the runtime moves to a newer Node. |
| #7 | eslint 9 → 10 | Left open | Major version; `npm ci` fails on the update branch (the exact dependency conflict was not investigated; the Next ESLint config is a likely cause). Revisit together with #5. |

No bulk update is made. Each open pull request stays visible so the decision is reversible; they should be re-tested when their blocking dependency moves.
