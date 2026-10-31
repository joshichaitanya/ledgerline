import { Kafka } from 'kafkajs';
import cron from 'node-cron';

const TOPIC = 'transactions';
const POLL_CRON_SCHEDULE = process.env.POLL_CRON_SCHEDULE || '*/1 * * * *';

const kafka = new Kafka({
  clientId: 'transaction-polling-consumer-service',
  brokers: [process.env.KAFKA_BROKER || 'kafka:9092'],
});

const consumer = kafka.consumer({ groupId: 'transaction-polling-consumer-service' });
let resumeFetching: (() => void) | null = null;

(async () => {
  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC, fromBeginning: false });

  await consumer.run({
    eachBatch: async ({ batch, resolveOffset, heartbeat, pause }) => {
      if (batch.messages.length === 0) {
        console.log('Poll: no messages');
        return;
      }

      for (const message of batch.messages) {
        console.log(`Polled message: ${message.value?.toString()}`);
        resolveOffset(message.offset);
        await heartbeat();
      }

      resumeFetching = pause();
      console.log(`Processed batch, paused until next cron tick (${POLL_CRON_SCHEDULE})`);
    },
  });

  cron.schedule(POLL_CRON_SCHEDULE, () => {
    if (resumeFetching) {
      console.log('Cron tick: resuming fetch');
      resumeFetching();
      resumeFetching = null;
    }
  });
})();
