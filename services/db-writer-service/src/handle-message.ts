import { KafkaMessage } from 'kafkajs';
import { Pool } from 'pg';
import { applyOperation, TouchedSpend } from './apply-operation';
import { DebeziumChangeEvent } from './types/event';

// Why an event went to the DLQ - each is something retrying can never fix.
export type DlqReason = 'unparseable' | 'unexpected-change' | 'unknown-operation' | 'bad-data' | 'wrong-owner';

// Passed in (not imported) so tests can run this against a real Postgres
// with a recording fake for the DLQ and cache - see test/.
export interface HandlerDeps {
  pool: Pool;
  sendToDlq(message: KafkaMessage, partition: number, reason: DlqReason, error?: unknown): Promise<void>;
  invalidateSpendTotals(touched: TouchedSpend[]): Promise<void>;
}

export type HandleOutcome = 'applied' | 'unchanged' | 'ignored' | 'dead-lettered';

// Postgres error classes 22 (data exception, e.g. invalid uuid/number) and
// 23 (integrity constraint violation, e.g. a CHECK failing) mean the event
// itself is bad - unlike connection errors, retrying it will never succeed.
// Also covers a payload that isn't valid JSON (SyntaxError from JSON.parse).
export function isBadDataError(error: unknown): boolean {
  if (error instanceof SyntaxError) return true;
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && (code.startsWith('22') || code.startsWith('23'));
}

// Errors are only thrown for things that might fix themselves (DB down,
// DLQ send failing, ...): kafkajs retries with backoff, and if retries run
// out the consumer crashes and restart: always (docker-compose.yml)
// redelivers from the last committed offset. Safe because applying is
// idempotent. Anything that can never succeed goes to the DLQ instead, so
// one bad event can't block its partition.
export async function handleMessage(
  deps: HandlerDeps,
  partition: number,
  message: KafkaMessage
): Promise<HandleOutcome> {
  const where = `partition ${partition} offset ${message.offset}`;

  const deadLetter = async (reason: DlqReason, error?: unknown): Promise<HandleOutcome> => {
    await deps.sendToDlq(message, partition, reason, error);
    console.error(`Sent event at ${where} to DLQ (${reason})`, error ?? '');
    return 'dead-lettered';
  };

  // Kafka tombstone (null value) - Debezium only emits these after a real
  // row DELETE, which event_store never does. Nothing to apply or keep.
  if (!message.value) return 'ignored';

  let event: DebeziumChangeEvent;
  try {
    event = JSON.parse(message.value.toString());
  } catch (error) {
    return deadLetter('unparseable', error);
  }

  // Only inserts (c) and initial snapshot reads (r) are expected:
  // event_store is insert-only (docs/adr/0005-event-store-insert-only.md).
  if ((event.op !== 'c' && event.op !== 'r') || !event.after) {
    return deadLetter('unexpected-change', `op=${event.op}`);
  }

  let result;
  try {
    result = await applyOperation(deps.pool, event.after);
  } catch (error) {
    if (isBadDataError(error)) return deadLetter('bad-data', error);
    throw error;
  }

  const { operation, item_id } = event.after;
  if (result.status === 'unknown') {
    return deadLetter('unknown-operation', `operation=${operation}`);
  }
  // A user tried to change a transaction that isn't theirs (ADR 0014).
  if (result.status === 'wrong-owner') {
    return deadLetter('wrong-owner', `user ${event.after.user_id} sent ${operation} for item ${item_id}, owned by user ${result.ownerId}`);
  }
  if (result.status === 'unchanged') {
    console.log(`No change from ${operation} for item ${item_id} - duplicate, stale, or tombstoned (${where})`);
    return 'unchanged';
  }

  await deps.invalidateSpendTotals(result.touched);
  console.log(`Applied ${operation} for item ${item_id} (${where})`);
  return 'applied';
}
