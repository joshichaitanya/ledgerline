// One event_store row, as Debezium puts it in the change event's `after`
// field (JsonConverter, schemas disabled). See infrastructure/cdc/.
export interface EventStoreRow {
  id: string;
  item_id: string;
  user_id: number;
  operation: string;
  // jsonb arrives as a JSON string (Debezium's io.debezium.data.Json), not an object.
  payload: string;
  // timestamptz arrives as an ISO string with microseconds - kept as a string
  // on purpose, see docs/adr/0010-idempotency-via-last-event-at.md.
  created_at: string;
}

export interface DebeziumChangeEvent {
  // c = insert, r = initial snapshot read, u/d = update/delete (never expected:
  // event_store is insert-only, see docs/adr/0005-event-store-insert-only.md).
  op: 'c' | 'r' | 'u' | 'd';
  before: EventStoreRow | null;
  after: EventStoreRow | null;
}

// Same shape create/update-transaction-service write into event_store.payload.
export interface TransactionPayload {
  transactionId: string;
  userId: number;
  subCategoryId: string;
  amount: number;
  description: string;
  transactionDate: string;
}
