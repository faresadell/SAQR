/**
 * A small in-memory stand-in for the parts of Prisma that the auth, OTP, session and user services use.
 * It lets those flows be tested in milliseconds without a database. It is NOT a replacement for the real
 * PostgreSQL integration tests (npm run test:integration), which prove the SQL, constraints and triggers.
 *
 * Supported filters: equality, null, lt / lte / gt / gte / not / in / equals, OR, AND. That is all the services need.
 */
import { Prisma } from "@prisma/client";

export type Row = Record<string, unknown> & { id: string };
type Where = Record<string, unknown>;

function compare(a: unknown, b: unknown): number {
  const x = a instanceof Date ? a.getTime() : (a as number | string);
  const y = b instanceof Date ? b.getTime() : (b as number | string);
  return x < y ? -1 : x > y ? 1 : 0;
}

function matchValue(actual: unknown, cond: unknown): boolean {
  const value = actual === undefined ? null : actual;
  if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime();
  if (cond !== null && typeof cond === "object") {
    const c = cond as Record<string, unknown>;
    let ok = true;
    if ("equals" in c) ok = ok && matchValue(value, c.equals);
    if ("lt" in c) ok = ok && value !== null && compare(value, c.lt) < 0;
    if ("lte" in c) ok = ok && value !== null && compare(value, c.lte) <= 0;
    if ("gt" in c) ok = ok && value !== null && compare(value, c.gt) > 0;
    if ("gte" in c) ok = ok && value !== null && compare(value, c.gte) >= 0;
    if ("not" in c) ok = ok && !matchValue(value, c.not);
    if ("in" in c) ok = ok && (c.in as unknown[]).includes(value);
    return ok;
  }
  return value === cond;
}

function matches(row: Row, where: Where | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, cond]) => {
    if (key === "OR") return (cond as Where[]).some((w) => matches(row, w));
    if (key === "AND") return (cond as Where[]).every((w) => matches(row, w));
    return matchValue(row[key], cond);
  });
}

function applyData(row: Row, data: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(data)) {
    if (value !== null && typeof value === "object" && !(value instanceof Date) && "increment" in value) {
      row[key] = ((row[key] as number) ?? 0) + Number((value as { increment: number }).increment);
    } else {
      row[key] = value;
    }
  }
}

interface FindArgs {
  where?: Where;
  orderBy?: Record<string, "asc" | "desc"> | Record<string, "asc" | "desc">[];
  take?: number;
}

export class FakeTable {
  rows: Row[] = [];
  private seq = 0;

  constructor(
    private readonly name: string,
    private readonly defaults: () => Record<string, unknown> = () => ({}),
    private readonly unique: string[] = [],
  ) {}

  reset(): void {
    this.rows = [];
    this.seq = 0;
  }

  private order(rows: Row[], orderBy: FindArgs["orderBy"]): Row[] {
    const keys = orderBy ? (Array.isArray(orderBy) ? orderBy : [orderBy]) : [];
    if (keys.length === 0) return rows;
    // Later insertion wins ties when sorting descending, like a real clock with finer resolution.
    const indexed = rows.map((row, index) => ({ row, index }));
    indexed.sort((a, b) => {
      for (const spec of keys) {
        const [field, dir] = Object.entries(spec)[0] as [string, "asc" | "desc"];
        const c = compare(a.row[field], b.row[field]);
        if (c !== 0) return dir === "asc" ? c : -c;
      }
      return keys.some((k) => Object.values(k)[0] === "desc") ? b.index - a.index : a.index - b.index;
    });
    return indexed.map((x) => x.row);
  }

  async create({ data }: { data: Record<string, unknown> }): Promise<Row> {
    for (const field of this.unique) {
      if (data[field] !== undefined && this.rows.some((r) => r[field] === data[field])) {
        throw new Prisma.PrismaClientKnownRequestError(`Unique constraint failed on ${this.name}.${field}`, {
          code: "P2002",
          clientVersion: "test",
        });
      }
    }
    const now = new Date();
    const row: Row = { ...this.defaults(), createdAt: now, updatedAt: now, ...data, id: (data.id as string | undefined) ?? `${this.name}_${++this.seq}` };
    this.rows.push(row);
    return { ...row };
  }

  async findUnique({ where }: { where: Where }): Promise<Row | null> {
    const row = this.rows.find((r) => matches(r, where));
    return row ? { ...row } : null;
  }

  async findFirst(args: FindArgs = {}): Promise<Row | null> {
    const row = this.order(this.rows.filter((r) => matches(r, args.where)), args.orderBy)[0];
    return row ? { ...row } : null;
  }

  async findMany(args: FindArgs = {}): Promise<Row[]> {
    const found = this.order(this.rows.filter((r) => matches(r, args.where)), args.orderBy);
    return (args.take ? found.slice(0, args.take) : found).map((r) => ({ ...r }));
  }

  async count({ where }: { where?: Where } = {}): Promise<number> {
    return this.rows.filter((r) => matches(r, where)).length;
  }

  async update({ where, data }: { where: Where; data: Record<string, unknown> }): Promise<Row> {
    const row = this.rows.find((r) => matches(r, where));
    if (!row) {
      throw new Prisma.PrismaClientKnownRequestError("Record to update not found", { code: "P2025", clientVersion: "test" });
    }
    applyData(row, data);
    row.updatedAt = new Date();
    return { ...row };
  }

  async updateMany({ where, data }: { where?: Where; data: Record<string, unknown> }): Promise<{ count: number }> {
    const targets = this.rows.filter((r) => matches(r, where));
    for (const row of targets) {
      applyData(row, data);
      row.updatedAt = new Date();
    }
    return { count: targets.length };
  }

  async deleteMany({ where }: { where?: Where } = {}): Promise<{ count: number }> {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => !matches(r, where));
    return { count: before - this.rows.length };
  }

  async upsert({ where, update, create }: { where: Where; update: Record<string, unknown>; create: Record<string, unknown> }): Promise<Row> {
    const row = this.rows.find((r) => matches(r, where));
    if (row) return this.update({ where, data: update });
    return this.create({ data: create });
  }
}

export function createFakeDb() {
  const user = new FakeTable(
    "user",
    () => ({
      phoneVerifiedAt: null, email: null, emailVerifiedAt: null, totpSecretEnc: null, lastTotpStep: null, isSuperAdmin: false,
      failedLoginCount: 0, lockedUntil: null, consentVersion: null, consentAcceptedAt: null, signupNonceHash: null, status: "PENDING",
    }),
    ["phone"],
  );
  const otpCode = new FakeTable("otpCode", () => ({ attempts: 0, consumedAt: null }));
  const rateLimitHit = new FakeTable("rateLimitHit");
  const baseSession = new FakeTable("session", () => ({ ip: null, userAgent: null }), ["tokenHash"]);
  const starAccount = new FakeTable("starAccount", () => ({ balance: 0 }), ["userId"]);
  const auditLog = new FakeTable("auditLog", () => ({ actorId: null, before: null, after: null, ip: null }));
  const platformSettingVersion = new FakeTable("platformSettingVersion");
  const adminPermission = new FakeTable("adminPermission");

  // Session lookups include the user and the user's admin permissions, like the real query does.
  const session = Object.assign(baseSession, {
    async findUnique({ where }: { where: Where }): Promise<(Row & { user: Row & { admin: Row[] } }) | null> {
      const row = await FakeTable.prototype.findUnique.call(baseSession, { where });
      if (!row) return null;
      const owner = await user.findUnique({ where: { id: row.userId } });
      if (!owner) return null;
      return { ...row, user: { ...owner, admin: await adminPermission.findMany({ where: { userId: owner.id } }) } };
    },
  });

  const tables = { user, otpCode, rateLimitHit, session, starAccount, auditLog, platformSettingVersion, adminPermission };
  const fake = {
    ...tables,
    async $transaction<T>(fn: (tx: typeof tables) => Promise<T>): Promise<T> {
      return fn(tables);
    },
    reset(): void {
      for (const table of Object.values(tables)) table.reset();
    },
    async grant(userId: string, permission: string): Promise<void> {
      await adminPermission.create({ data: { userId, permission } });
    },
  };
  return fake;
}

export type FakeDb = ReturnType<typeof createFakeDb>;
