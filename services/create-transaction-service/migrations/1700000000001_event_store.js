const HASH_BUCKETS = 4;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE event_store (
      id         uuid NOT NULL,
      item_id    uuid NOT NULL,
      user_id    integer NOT NULL,
      operation  text NOT NULL,
      payload    jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (id, created_at, item_id)
    ) PARTITION BY RANGE (created_at);

    -- No secondary indexes on item_id/user_id: CDC reads straight from the
    -- WAL (not via queries), so they'd add write overhead per insert with
    -- no benefit to the actual pipeline. The primary key above is required
    -- (Postgres needs it for partitioning) and is not optional.

    -- One partition per day, so a whole day's worth of rows can be dropped
    -- at once for TTL cleanup, instead of deleting rows one by one.
    --
    -- Each day's partition is further split into ${HASH_BUCKETS} hash buckets
    -- by item_id, so writes for different items land in different physical
    -- partitions during that day (spreads out write load at peak traffic),
    -- while the whole day can still be dropped in one shot for cleanup.
    --
    -- In production, a scheduled job should create each new day's partition
    -- ahead of time using this same pattern. This migration only creates
    -- today's, so anything outside today falls into the DEFAULT partition
    -- below until that job exists.
    DO $$
    DECLARE
      day_start date := CURRENT_DATE;
      day_end date := CURRENT_DATE + 1;
      partition_name text := 'event_store_' || to_char(CURRENT_DATE, 'YYYY_MM_DD');
    BEGIN
      EXECUTE format(
        'CREATE TABLE %I PARTITION OF event_store FOR VALUES FROM (%L) TO (%L) PARTITION BY HASH (item_id)',
        partition_name, day_start, day_end
      );

      FOR i IN 0..${HASH_BUCKETS - 1} LOOP
        EXECUTE format(
          'CREATE TABLE %I PARTITION OF %I FOR VALUES WITH (MODULUS ${HASH_BUCKETS}, REMAINDER %s)',
          partition_name || '_' || i, partition_name, i
        );
      END LOOP;
    END $$;

    CREATE TABLE event_store_default PARTITION OF event_store DEFAULT;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS event_store;
  `);
};
