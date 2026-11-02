/**
 * Manual administrator recovery (lost authenticator AND lost backup codes). Run ONLY by the system owner, after the main
 * administrator's identity was verified out-of-band. It never touches the password and is never reachable from the web.
 *
 *   npm run admin:reset-totp -- --phone 01012345678 --confirm-phone 01012345678 --reason "Lost phone, verified by video call on 2026-11-01"
 *
 * Revokes every session, voids unused backup codes, issues a NEW authenticator secret (printed once) and writes an audit entry.
 * Only pure modules are imported (no "server-only" code) so it can run outside Next.js.
 */
import { PrismaClient } from "@prisma/client";
import { normalizeEgyptPhone } from "../src/lib/auth/phone";
import { encryptSecret, parseEncryptionKey } from "../src/lib/auth/secret-box";
import { base32Encode, generateTotpSecret, otpauthUri } from "../src/lib/auth/totp";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const phone = normalizeEgyptPhone(arg("phone") ?? "");
  const confirm = normalizeEgyptPhone(arg("confirm-phone") ?? "");
  const reason = arg("reason")?.trim() ?? "";
  if (!phone || phone !== confirm) throw new Error("--phone and --confirm-phone must be the same valid Egyptian mobile number");
  if (reason.length < 15) throw new Error('--reason must say how the owner was verified (at least 15 characters)');
  const key = parseEncryptionKey(process.env.DATA_ENCRYPTION_KEY ?? "");

  const db = new PrismaClient();
  try {
    const admin = await db.user.findUnique({ where: { phone } });
    if (!admin || admin.role !== "ADMIN") throw new Error("No administrator has this phone number");
    const secret = generateTotpSecret();
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: admin.id }, data: { totpSecretEnc: encryptSecret(key, secret), lastTotpStep: null, failedLoginCount: 0, lockedUntil: null } });
      await tx.session.deleteMany({ where: { userId: admin.id } });
      await tx.adminRecoveryCode.updateMany({ where: { userId: admin.id, usedAt: null }, data: { usedAt: new Date() } });
      await tx.auditLog.create({ data: { actorId: null, action: "ADMIN_TOTP_RESET_MANUAL", entityType: "User", entityId: admin.id, after: { reason } } });
    });
    console.log("\nAuthenticator reset. All sessions were revoked and old backup codes voided.");
    console.log("Add this to the authenticator app NOW (shown only once):\n");
    console.log(otpauthUri(phone, secret));
    console.log(`\nManual entry key: ${base32Encode(secret)}\n`);
    console.log("Then sign in and create new backup codes (POST /api/v1/admin/recovery-codes).");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
