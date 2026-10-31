import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { TransactionRecorder } from './transaction-recorder.interface';

export class EventStoreRecorder implements TransactionRecorder {
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

  async recordOperation(itemId: string, userId: number, operation: 'create', payload: unknown) {
    await this.pool.query(
      `INSERT INTO event_store (id, item_id, user_id, operation, payload)
       VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), itemId, userId, operation, JSON.stringify(payload)]
    );
  }
}
