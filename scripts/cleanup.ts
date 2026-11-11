/**
 * Deletes expired rate-limit hits, old one-time codes and expired sessions. Safe to run as often as you like.
 *   npm run maintenance:cleanup
 * Schedule it (cron, systemd timer, platform scheduler) at least once a day. See docs/PHASE1.md.
 */
import { PrismaClient } from "@prisma/client";
import { purgeExpiredAuthData } from "../src/lib/maintenance/purge";

const db = new PrismaClient();
purgeExpiredAuthData(db)
  .then((result) => console.log(`Cleanup finished: ${JSON.stringify(result)}`))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
