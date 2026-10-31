// Topic Debezium publishes event_store changes to - see
// infrastructure/cdc/event-store-connector.json (topic.prefix + schema + table).
export const EVENT_STORE_TOPIC = 'event_store.public.event_store';

// Events that can never be applied (bad data, unparseable, unknown
// operation) go here instead of being dropped - see src/dlq.ts.
export const DLQ_TOPIC = `${EVENT_STORE_TOPIC}.dlq`;
