import path from 'path';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import runner from 'node-pg-migrate';

// A throwaway event-store-db. event_store's schema is owned by
// create-transaction-service, so its migration is run straight from there -
// the tests can't drift from the real schema.
export async function startEventStoreDb(): Promise<{ container: StartedPostgreSqlContainer; databaseUrl: string }> {
  const container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const databaseUrl = container.getConnectionUri();

  await runner({
    databaseUrl,
    dir: path.join(__dirname, '../../create-transaction-service/migrations'),
    direction: 'up',
    migrationsTable: 'event_store_migrations',
    log: () => {},
  });

  return { container, databaseUrl };
}
