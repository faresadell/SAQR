/**
 * Creates the main administrator. Admins are never created through the public site.
 *
 *   ADMIN_PASSWORD='a-long-unique-password' npm run admin:create -- --phone 01012345678 --name "Your Name"
 *
 * Prints a one-time authenticator link/secret. Add it to Google Authenticator immediately.
 * Only pure modules are imported here (no "server-only" code) so it can run outside Next.js.
 */
import { PrismaClient } from "@prisma/client";
import { normalizeEgyptPhone } from "../src/lib/auth/phone";
import { checkPasswordStrength, hashPassword } from "../src/lib/auth/password";
import { encryptSecret, parseEncryptionKey } from "../src/lib/auth/secret-box";
import { generateTotpSecret, otpauthUri, base32Encode } from "../src/lib/auth/totp";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const phone = normalizeEgyptPhone(arg("phone") ?? "");
  const name = arg("name")?.trim();
  const password = process.env.ADMIN_PASSWORD ?? "";
  const keyB64 = process.env.DATA_ENCRYPTION_KEY ?? "";

  if (!phone) throw new Error("--phone must be a valid Egyptian mobile number");
  if (!name || name.length < 2) throw new Error("--name is required");
  const problem = checkPasswordStrength(password, phone);
  if (problem) throw new Error(`ADMIN_PASSWORD rejected: ${problem}. Use a long, unique password.`);
  if (password.length < 12) throw new Error("ADMIN_PASSWORD must be at least 12 characters for administrators");
  const key = parseEncryptionKey(keyB64);

  const db = new PrismaClient();
  try {
    if (await db.user.findUnique({ where: { phone } })) throw new Error("A user with this phone already exists");

    const secret = generateTotpSecret();
    const admin = await db.user.create({
      data: {
        phone,
        name,
        role: "ADMIN",
        status: "ACTIVE",
        isSuperAdmin: true,
        phoneVerifiedAt: new Date(),
        passwordHash: await hashPassword(password),
        totpSecretEnc: encryptSecret(key, secret),
      },
    });
    await db.auditLog.create({
      data: { actorId: null, action: "ADMIN_CREATED", entityType: "User", entityId: admin.id, after: { phone, name } },
    });

    console.log("\nAdministrator created.");
    console.log("Add this to your authenticator app NOW (it is shown only once):\n");
    console.log(otpauthUri(phone, secret));
    console.log(`\nManual entry key: ${base32Encode(secret)}\n`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
