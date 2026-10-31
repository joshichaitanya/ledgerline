import path from 'path';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import runner from 'node-pg-migrate';

// A throwaway event-store-db with this service's real migration applied
// (partitioned event_store: today's partition + the default one).
export async function startEventStoreDb(): Promise<{ container: StartedPostgreSqlContainer; databaseUrl: string }> {
  const container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const databaseUrl = container.getConnectionUri();

  await runner({
    databaseUrl,
    dir: path.join(__dirname, '../migrations'),
    direction: 'up',
    migrationsTable: 'event_store_migrations',
    log: () => {},
  });

  return { container, databaseUrl };
}
