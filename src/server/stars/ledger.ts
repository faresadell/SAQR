import "server-only";
import type { Prisma, StarReason } from "@prisma/client";

export class InsufficientStarsError extends Error {
  constructor() {
    super("Insufficient star balance");
    this.name = "InsufficientStarsError";
  }
}

export interface StarMove {
  userId: string;
  /** Signed. Negative = deduction. Never zero. */
  amount: number;
  reason: StarReason;
  /** Deterministic key from src/lib/stars/rules.ts ledgerKeys. A repeated key is a no-op that returns the first result. */
  idempotencyKey: string;
  orderId?: string | null;
  actorId?: string | null;
  note?: string | null;
}

export type StarMoveResult = { applied: true; balanceAfter: number } | { applied: false; duplicate: true; balanceAfter: number };

/**
 * The ONLY function that changes a star balance. It must run inside a database transaction (pass `tx`).
 * 1. Make sure the account exists, then lock its row (SELECT ... FOR UPDATE) so concurrent moves are serialized.
 * 2. If this idempotency key was already used, return the earlier result and change nothing.
 * 3. Refuse to go below zero (the database CHECK is the second line of defence).
 * 4. Write the ledger row and the cached balance together; the ledger row stores balanceAfter.
 */
export async function applyStarMove(tx: Prisma.TransactionClient, move: StarMove): Promise<StarMoveResult> {
  if (!Number.isInteger(move.amount) || move.amount === 0) throw new RangeError("Star amount must be a non-zero integer");

  await tx.starAccount.upsert({ where: { userId: move.userId }, create: { userId: move.userId }, update: {} });
  const locked = await tx.$queryRaw<{ id: string; balance: number }[]>`SELECT "id", "balance" FROM "StarAccount" WHERE "userId" = ${move.userId} FOR UPDATE`;
  const account = locked[0];
  if (!account) throw new Error("Star account missing after upsert");

  const existing = await tx.starLedgerEntry.findUnique({ where: { idempotencyKey: move.idempotencyKey } });
  if (existing) return { applied: false, duplicate: true, balanceAfter: existing.balanceAfter };

  const balanceAfter = account.balance + move.amount;
  if (balanceAfter < 0) throw new InsufficientStarsError();

  await tx.starLedgerEntry.create({
    data: {
      accountId: account.id,
      amount: move.amount,
      balanceAfter,
      reason: move.reason,
      orderId: move.orderId ?? null,
      actorId: move.actorId ?? null,
      note: move.note ?? null,
      idempotencyKey: move.idempotencyKey,
    },
  });
  await tx.starAccount.update({ where: { id: account.id }, data: { balance: balanceAfter } });
  return { applied: true, balanceAfter };
}

/**
 * Move stars for several users in one transaction. Accounts are locked in sorted user-id order so two transactions
 * touching the same pair can never deadlock each other.
 */
export async function applyStarMoves(tx: Prisma.TransactionClient, moves: StarMove[]): Promise<StarMoveResult[]> {
  const ordered = [...moves].sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
  const results = new Map<StarMove, StarMoveResult>();
  for (const move of ordered) results.set(move, await applyStarMove(tx, move));
  return moves.map((m) => results.get(m)!);
}

export async function getStarBalance(client: Prisma.TransactionClient, userId: string): Promise<number> {
  const account = await client.starAccount.findUnique({ where: { userId } });
  return account?.balance ?? 0;
}
