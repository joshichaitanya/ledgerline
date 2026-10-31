import { Pool } from 'pg';

const HASH_BUCKETS = 4;
const RETENTION_DAYS = 1;

/**
 * Creates tomorrow's event_store partition (with its hash sub-partitions) if it
 * doesn't already exist, and drops any partition older than RETENTION_DAYS.
 * Meant to run once a day (see k8s/event-store-partition-manager.yaml).
 */
async function managePartitions(pool: Pool) {
  await createPartitionForDate(pool, tomorrow());
  await dropOldPartitions(pool);
}

function tomorrow(): Date {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date;
}

function partitionNameFor(date: Date): string {
  const isoDate = date.toISOString().slice(0, 10); // YYYY-MM-DD
  return `event_store_${isoDate.replace(/-/g, '_')}`;
}

async function createPartitionForDate(pool: Pool, date: Date) {
  const partitionName = partitionNameFor(date);
  const dayStart = date.toISOString().slice(0, 10);
  const dayEndDate = new Date(date);
  dayEndDate.setDate(dayEndDate.getDate() + 1);
  const dayEnd = dayEndDate.toISOString().slice(0, 10);

  // format()'s arguments are variadic ("any" type), so Postgres can't infer
  // $1/$2/$3's types from context alone (error 42P18) - explicit casts fix
  // it, since format() itself doesn't care what type its inputs were.
  const partitionSql = await pool.query(
    `SELECT format(
       'CREATE TABLE IF NOT EXISTS %I PARTITION OF event_store FOR VALUES FROM (%L) TO (%L) PARTITION BY HASH (item_id)',
       $1::text, $2::text, $3::text
     )`,
    [partitionName, dayStart, dayEnd]
  );
  await pool.query(partitionSql.rows[0].format);

  for (let i = 0; i < HASH_BUCKETS; i++) {
    const bucketSql = await pool.query(
      `SELECT format(
         'CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES WITH (MODULUS ${HASH_BUCKETS}, REMAINDER %s)',
         $1::text, $2::text, $3::int
       )`,
      [`${partitionName}_${i}`, partitionName, i]
    );
    await pool.query(bucketSql.rows[0].format);
  }

  console.log(`Ensured partition ${partitionName} exists (${dayStart} to ${dayEnd})`);
}

async function dropOldPartitions(pool: Pool) {
  const { rows } = await pool.query(
    `SELECT inhrelid::regclass::text AS partition_name
     FROM pg_inherits
     WHERE inhparent = 'event_store'::regclass`
  );

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  const cutoffDateString = cutoff.toISOString().slice(0, 10).replace(/-/g, '_');

  for (const { partition_name: partitionName } of rows) {
    const match = partitionName.match(/^event_store_(\d{4}_\d{2}_\d{2})$/);
    if (!match) continue; // skip hash sub-partitions and the default partition

    const partitionDateString = match[1];
    if (partitionDateString < cutoffDateString) {
      await pool.query(`DROP TABLE IF EXISTS ${partitionName}`);
      console.log(`Dropped expired partition ${partitionName}`);
    }
  }
}

if (require.main === module) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  managePartitions(pool)
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      pool.end();
      process.exit(1);
    });
}

export { managePartitions };
