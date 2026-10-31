import { randomUUID } from 'crypto';
import { Pool } from 'pg';

// Only ever writes `delete` (tombstone) rows - see
// docs/adr/0005-event-store-insert-only.md: a delete is a new row saying
// so, never a real Postgres DELETE, so CDC can forward it like any other
// change without special-casing.
export class EventStoreRecorder {
  private static instance: EventStoreRecorder;
  private pool: Pool;

  private constructor(connectionString: string = process.env.DATABASE_URL || '') {
    this.pool = new Pool({ connectionString });
  }

  static getInstance(): EventStoreRecorder {
    if (!EventStoreRecorder.instance) {
      EventStoreRecorder.instance = new EventStoreRecorder();
    }
    return EventStoreRecorder.instance;
  }

  async connect() {
    await this.pool.query('SELECT 1');
  }

  async recordDelete(transactionId: string, userId: number) {
    await this.pool.query(
      `INSERT INTO event_store (id, item_id, user_id, operation, payload)
       VALUES ($1, $2, $3, 'delete', $4)`,
      [randomUUID(), transactionId, userId, JSON.stringify({ transactionId, userId })]
    );
  }
}
