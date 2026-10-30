# npm audit

Policy: `npm run audit` must pass in CI (high and above). It is not weakened or skipped.

Findings at the time of this batch and how they were handled:

| Package | Advisory level | Affected range | Fix | Handling |
|---|---|---|---|---|
| postcss (via next) | moderate | < 8.5.23 | postcss >= 8.5.23 (minor) | `overrides.next.postcss = ^8.5.23` |
| deepmerge-ts (via prisma/@prisma/config) | high | old 7.x | deepmerge-ts ^8 | `overrides.deepmerge-ts = ^8.0.0`; no Prisma major upgrade |
| zod | high | < 4.6.6 | zod 4.6.7 (major) | upgraded to `^4.6.7`; typecheck, lint, unit tests, `next build` and all integration tests pass in CI |

Avoided on purpose: Prisma 7 and Next major upgrades (driver adapters and other breaking changes).

Remaining risk: overrides pin transitive packages beyond what their parents declare; re-run `npm audit` and CI on every dependency change, and remove an override once the parent package ships the fix. A committed `package-lock.json` is still required (it was not in the imported repository); until then CI resolves versions at run time.
