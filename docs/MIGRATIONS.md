# Database migrations

The database is created ONLY by `prisma migrate deploy` (local, CI, production). `prisma db push` is no longer used.

- `prisma/migrations/20261030000000_baseline/migration.sql`: the full schema (generated with `prisma migrate diff --from-empty --to-schema-datamodel`) followed by the hand-written protections `prisma/manual/001..006` (append-only triggers, CHECKs, partial unique indexes, statement-freezing triggers). It was generated, applied to an empty PostgreSQL 16 and checked by a CI workflow, then the whole test suite ran on a database built from it.
- The files in `prisma/manual/` are kept as readable source of the protections; the baseline already contains them. Do not re-apply them.
- Future changes: edit `schema.prisma`, run `prisma migrate dev --create-only`, then REVIEW the SQL. Prisma does not know about the partial unique indexes and triggers made by hand, so it may propose `DROP INDEX` for them: delete those lines. Put new triggers/CHECKs in the same migration file.
- Existing environment created with `db push` (if any): do not run the baseline on it. Run `prisma migrate resolve --applied 20261030000000_baseline` after confirming that its schema matches.
- Production: `npx prisma migrate deploy` before starting the new version; never `migrate dev` or `db push` there.
