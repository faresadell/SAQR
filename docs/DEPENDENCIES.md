# Dependency updates (Dependabot review)

Reviewed on 2026-11-02 against `main` after the frontend wiring batches. Each pull request was brought up to date with `main` and run through the full CI (`npm ci`, generate, typecheck, lint, tests, migrations, build).

| PR | Update | Decision | Verified reason |
|----|--------|----------|-----------------|
| #1 | actions/setup-node 4 → 7 | **Merged** | CI green. |
| #2 | actions/checkout 4 → 7 | **Applied by PR #22** (merged, CI green) | Dependabot's branch conflicted after #1; same change applied on top of `main`. |
| #4 | @prisma/client 6 → 7 | Left open | Probe on a throwaway branch (`npm install @prisma/client@7 prisma@7`, then `prisma generate`): **fails** with P1012 "The datasource property `url` is no longer supported in schema files". Prisma 7 needs a `prisma.config.ts` for Migrate and a driver `adapter` passed to `PrismaClient`. That changes how the app connects to the database, so it needs its own change with a rehearsal against a copy of production data. Lint and unit tests passed with it; typecheck was blocked by the failed generate. |
| #5 | eslint-config-next 15 → 16 | Left open | Probe: install OK, typecheck OK, tests OK, **lint crashes** ("Converting circular structure to JSON") because `eslint.config.mjs` loads the Next config through the legacy compatibility layer; version 16 ships a native flat config. Needs an ESLint config rewrite and a re-check of the new React Hooks rules; not a drop-in bump. |
| #6 | @types/node 22 → 26 | Left open (your call) | Probe: typecheck, lint and tests all **pass**. It is held back only because the runtime is Node 22 (CI and deployment): Node 26 type definitions would let code use APIs that do not exist at runtime. Safe to merge only if the runtime moves to Node 26. |
| #7 | eslint 9 → 10 | Left open | Dependabot's branch hits `ERESOLVE`: `eslint-config-next@15` does not allow ESLint 10. Probe with `eslint@10` + `eslint-config-next@16`: install works with overridden-peer warnings, tests and typecheck pass, **lint crashes** with the same circular-JSON error as #5. Do it together with #5. |

Note on earlier results: when the Dependabot branches were refreshed with "update branch", the lockfile on #4, #5 and #6 went out of sync with `package.json` (`npm ci` refused). That failure came from the refresh, not from the packages themselves; the probe above (which regenerates the lockfile) is the real compatibility check.

No bulk update is made. Each open pull request stays visible so the decision is reversible.
