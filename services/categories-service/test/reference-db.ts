import path from 'path';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import runner from 'node-pg-migrate';

// A throwaway reference-db with this service's real migrations applied -
// including the shared default categories.
export async function startReferenceDb(): Promise<{ container: StartedPostgreSqlContainer; databaseUrl: string }> {
  const container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const databaseUrl = container.getConnectionUri();

  await runner({
    databaseUrl,
    dir: path.join(__dirname, '../migrations'),
    direction: 'up',
    migrationsTable: 'reference_migrations',
    log: () => {},
  });

  return { container, databaseUrl };
}
