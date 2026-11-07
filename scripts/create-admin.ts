/**
 * Creates the main administrator. Admins are never created through the public site.
 *
 *   ADMIN_PASSWORD='a-long-unique-password' npm run admin:create -- --email you@example.com --phone 01012345678 --name "Your Name"
 *
 * Only pure modules are imported here (no "server-only" code) so it can run outside Next.js.
 */
import { PrismaClient } from "@prisma/client";
import { normalizeEgyptPhone } from "../src/lib/auth/phone";
import { checkPasswordStrength, hashPassword } from "../src/lib/auth/password";
import { normalizeEmail } from "../src/lib/auth/email";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const phone = normalizeEgyptPhone(arg("phone") ?? "");
  const name = arg("name")?.trim();
  const password = process.env.ADMIN_PASSWORD ?? "";
  const email = normalizeEmail(arg("email") ?? "");

  if (!email) throw new Error("--email must be a valid email address");
  if (!phone) throw new Error("--phone must be a valid Egyptian mobile number");
  if (!name || name.length < 2) throw new Error("--name is required");
  const problem = checkPasswordStrength(password, phone);
  if (problem) throw new Error(`ADMIN_PASSWORD rejected: ${problem}. Use a long, unique password.`);
  if (password.length < 12) throw new Error("ADMIN_PASSWORD must be at least 12 characters for administrators");

  const db = new PrismaClient();
  try {
    if (await db.user.findFirst({ where: { OR: [{ phone }, { email }] } })) throw new Error("A user with this phone or email already exists");

    const admin = await db.user.create({
      data: {
        phone,
        email,
        name,
        role: "ADMIN",
        status: "ACTIVE",
        isSuperAdmin: true,
        phoneVerifiedAt: new Date(),
        emailVerifiedAt: new Date(),
        passwordHash: await hashPassword(password),
      },
    });
    await db.auditLog.create({
      data: { actorId: null, action: "ADMIN_CREATED", entityType: "User", entityId: admin.id, after: { phone, email, name } },
    });

    console.log(`\nAdministrator created. Sign in at /login with ${email} and the password you set.\n`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
