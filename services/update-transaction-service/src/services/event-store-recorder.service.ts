import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { Transaction } from '../types/transaction';

// Only ever writes `update` rows - unlike create-transaction-service, this
// service has exactly one job. See docs/adr/0002-event-store-before-kafka.md
// for why writes go to event_store instead of straight to Kafka.
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

  async recordUpdate(transaction: Transaction) {
    await this.pool.query(
      `INSERT INTO event_store (id, item_id, user_id, operation, payload)
       VALUES ($1, $2, $3, 'update', $4)`,
      [randomUUID(), transaction.transactionId, transaction.userId, JSON.stringify(transaction)]
    );
  }
}
