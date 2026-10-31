-- Debezium's Postgres connector has no config property that actually sets
-- publish_via_partition_root (confirmed by testing - an earlier attempt at
-- "publish.via.partition.root": "true" in event-store-connector.json did
-- nothing; it's not a real Debezium property, just silently ignored).
--
-- Without this, partition changes arrive tagged with the PARTITION's name
-- (e.g. event_store_default, event_store_2026_09_13_0), not "event_store" -
-- so Debezium's table.include.list ("public.event_store") never matches
-- them, and rows silently never reach Kafka. This must be set on the
-- publication itself, before Debezium starts streaming from it.
--
-- Runs before the connector is registered (see docker-compose.yml's
-- event-store-publication-init service / k8s/kafka-connect.yaml's init
-- container) so the publication has this set from the start, whether
-- Debezium ends up creating it (first run) or reusing it (later runs).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'event_store_cdc_publication') THEN
    CREATE PUBLICATION event_store_cdc_publication FOR TABLE public.event_store
      WITH (publish_via_partition_root = true);
  ELSE
    ALTER PUBLICATION event_store_cdc_publication SET (publish_via_partition_root = true);
  END IF;
END $$;
