import { Kafka } from 'kafkajs';
import { Pool } from 'pg';

const TOPIC = 'transactions';

interface Transaction {
  transactionId: string;
  userId: number;
  subCategoryId: string;
  amount: number;
  description: string;
  transactionDate: string;
}

const kafka = new Kafka({
  clientId: 'transaction-consumer-service',
  brokers: [process.env.KAFKA_BROKER || 'kafka:9092'],
});

const consumer = kafka.consumer({ groupId: 'transaction-consumer-service' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function insertTransactions(transactions: Transaction[]) {
  if (transactions.length === 0) return;

  const values: unknown[] = [];
  const rows = transactions.map((t, i) => {
    const base = i * 6;
    values.push(t.transactionId, t.userId, t.subCategoryId, t.amount, t.description, t.transactionDate);
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
  });

  await pool.query(
    `INSERT INTO transactions (id, user_id, subcategory_id, amount, description, transaction_date)
     VALUES ${rows.join(', ')}
     ON CONFLICT (id) DO NOTHING`,
    values
  );
}

(async () => {
  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC, fromBeginning: true });

  await consumer.run({
    eachBatch: async ({ batch, resolveOffset, heartbeat }) => {
      const parsed: { offset: string; transaction: Transaction }[] = [];

      for (const message of batch.messages) {
        console.log(`Received message: ${message.value?.toString()}`);
        if (message.value) {
          try {
            const transaction: Transaction = JSON.parse(message.value.toString());
            parsed.push({ offset: message.offset, transaction });
          } catch (error) {
            console.error(`Failed to parse message at offset ${message.offset}:`, error);
            // A message that can never parse would block the partition
            // forever if left unresolved, so resolve it now and move on.
            resolveOffset(message.offset);
          }
        } else {
          resolveOffset(message.offset);
        }
        await heartbeat();
      }

      try {
        await insertTransactions(parsed.map((p) => p.transaction));
        for (const { offset } of parsed) {
          resolveOffset(offset);
        }
      } catch (error) {
        console.error('Failed to insert transactions batch:', error);
        // Offsets intentionally NOT resolved here. Throwing lets kafkajs's
        // built-in retry/backoff take over; if retries are exhausted the
        // consumer crashes, and restart: always (docker-compose.yml) brings
        // it back up to rejoin and redeliver this same batch from the last
        // successfully committed offset.
        throw error;
      }
    },
  });
})();
