import path from 'path';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import runner from 'node-pg-migrate';

// A throwaway transactions-db. Its schema is owned by db-writer-service (the
// only writer), so its migrations are run straight from there - the tests
// can't drift from the real schema.
export async function startTransactionsDb(): Promise<{ container: StartedPostgreSqlContainer; databaseUrl: string }> {
  const container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const databaseUrl = container.getConnectionUri();

  await runner({
    databaseUrl,
    dir: path.join(__dirname, '../../db-writer-service/migrations/transactions'),
    direction: 'up',
    migrationsTable: 'transactions_migrations',
    log: () => {},
  });

  return { container, databaseUrl };
}

// A throwaway spend-summary-cache (same image as docker-compose.yml).
export async function startRedis(): Promise<{ container: StartedTestContainer; redisUrl: string }> {
  const container = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();
  return { container, redisUrl: `redis://${container.getHost()}:${container.getMappedPort(6379)}` };
}
