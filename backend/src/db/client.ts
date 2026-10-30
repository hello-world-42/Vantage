import {
  Pool,
  type QueryResult,
  type QueryResultRow,
} from "pg";

let pool: Pool | undefined;

/**
 * Returns the shared PostgreSQL connection pool.
 *
 * Pool creation is lazy so server.ts can load the root .env before the first
 * database query runs.
 */
export function getDatabasePool(): Pool {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to connect to PostgreSQL");
  }

  pool = new Pool({ connectionString });
  return pool;
}

export function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values?: unknown[],
): Promise<QueryResult<T>> {
  return getDatabasePool().query<T>(text, values);
}

export async function closeDatabasePool(): Promise<void> {
  if (!pool) return;

  const activePool = pool;
  pool = undefined;
  await activePool.end();
}
