import { Kafka } from 'kafkajs';
import { Pool } from 'pg';
import { createDlqPublisher, ensureDlqTopic } from './dlq';
import { handleMessage, HandlerDeps } from './handle-message';
import { connectCache, disconnectCache, invalidateSpendTotals } from './spend-summary-cache';
import { EVENT_STORE_TOPIC } from './topics';

const kafka = new Kafka({
  clientId: 'db-writer-service',
  brokers: [process.env.KAFKA_BROKER || 'kafka:9092'],
});

const consumer = kafka.consumer({ groupId: 'db-writer-service' });
const producer = kafka.producer({ allowAutoTopicCreation: false });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const deps: HandlerDeps = {
  pool,
  sendToDlq: createDlqPublisher(producer),
  invalidateSpendTotals,
};

// Leave the consumer group cleanly on stop/deploy. Without this, node (PID 1
// in the container, so no default SIGTERM handling) gets force-killed, and
// Kafka keeps its partitions assigned to the dead member until the session
// times out (~30s) - nothing gets processed meanwhile.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, async () => {
    console.log(`Received ${signal}, disconnecting`);
    await consumer.disconnect();
    await producer.disconnect();
    await pool.end();
    await disconnectCache();
    process.exit(0);
  });
}

(async () => {
  await connectCache();

  const admin = kafka.admin();
  await admin.connect();
  await ensureDlqTopic(admin);
  await admin.disconnect();

  await producer.connect();
  await consumer.connect();
  await consumer.subscribe({ topic: EVENT_STORE_TOPIC, fromBeginning: true });

  // eachMessage (not eachBatch like transaction-consumer-service): each event
  // is its own conditional upsert/tombstone write, so there's no single
  // multi-row INSERT to batch them into. Messages within a partition are
  // still handled strictly in order, which keeps per-item order intact.
  await consumer.run({
    eachMessage: async ({ partition, message }) => {
      await handleMessage(deps, partition, message);
    },
  });
})();
