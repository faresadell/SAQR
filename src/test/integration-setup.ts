/**
 * Safety net for integration tests: they TRUNCATE tables, so they refuse to run against a database that does not
 * look like a throwaway one. The database name must end in "test" or "ci" (CI uses "ci", the README uses "saqr_test").
 * Set ALLOW_DESTRUCTIVE_TESTS=1 only if you are certain the target database can be wiped.
 */
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required for integration tests");

const dbName = (() => {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  } catch {
    return "";
  }
})();

if (process.env.ALLOW_DESTRUCTIVE_TESTS !== "1" && !/(test|ci)$/i.test(dbName)) {
  throw new Error(
    `Refusing to run integration tests: database "${dbName}" does not end in "test" or "ci". ` +
      "These tests TRUNCATE tables. Use a throwaway database (e.g. saqr_test).",
  );
}

export {};
