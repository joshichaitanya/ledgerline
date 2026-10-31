import path from 'path';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import runner from 'node-pg-migrate';

// A throwaway transactions-db with the real migrations applied - so tests
// exercise the actual SQL guards (last_event_at, deleted_at, the CHECK
// constraint), not a fake of them.
export async function startTransactionsDb(): Promise<{ container: StartedPostgreSqlContainer; databaseUrl: string }> {
  const container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const databaseUrl = container.getConnectionUri();

  await runner({
    databaseUrl,
    dir: path.join(__dirname, '../migrations/transactions'),
    direction: 'up',
    migrationsTable: 'transactions_migrations',
    log: () => {},
  });

  return { container, databaseUrl };
}
