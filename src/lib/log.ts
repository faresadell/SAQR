/**
 * Logs a failure without dumping the error object. Database errors carry the query arguments (phone numbers, emails, addresses),
 * so for those only the name and code are printed; for anything else the first line of the message is kept to stay debuggable.
 */
export function logError(error: unknown, context = "error"): void {
  if (!(error instanceof Error)) {
    console.error(`${context}: unknown`);
    return;
  }
  const code = (error as { code?: unknown }).code;
  const isDb = error.name.startsWith("Prisma") || typeof code === "string";
  const detail = isDb ? `${error.name}${typeof code === "string" ? ` ${code}` : ""}` : `${error.name}: ${(error.message.split("\n")[0] ?? "").slice(0, 200)}`;
  console.error(`${context}: ${detail}`);
}
