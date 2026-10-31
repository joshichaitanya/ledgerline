import { Admin, Producer } from 'kafkajs';
import { DLQ_TOPIC, EVENT_STORE_TOPIC } from './topics';
import { HandlerDeps } from './handle-message';

// Created on startup since Kafka's auto topic creation is off. One
// partition: dead-lettered events should be rare, and order doesn't matter.
// retention.ms -1 keeps them until someone deals with them - the default
// 7-day retention would silently delete the very events it exists to keep.
export async function ensureDlqTopic(admin: Admin) {
  const created = await admin.createTopics({
    waitForLeaders: true,
    topics: [
      {
        topic: DLQ_TOPIC,
        numPartitions: 1,
        replicationFactor: 1,
        configEntries: [{ name: 'retention.ms', value: '-1' }],
      },
    ],
  });
  console.log(created ? `Created ${DLQ_TOPIC}` : `${DLQ_TOPIC} already exists`);
}

// Keeps the original key and value untouched, so a fixed event can be
// re-published to the source topic as-is; why and where it failed goes in
// headers. A failed send throws, so kafkajs retries the original event
// rather than losing it.
export function createDlqPublisher(producer: Producer): HandlerDeps['sendToDlq'] {
  return async (message, partition, reason, error) => {
    await producer.send({
      topic: DLQ_TOPIC,
      messages: [
        {
          key: message.key,
          value: message.value,
          headers: {
            ...message.headers,
            'dlq-reason': reason,
            'dlq-error': error instanceof Error ? error.message : String(error ?? ''),
            'dlq-source-topic': EVENT_STORE_TOPIC,
            'dlq-source-partition': String(partition),
            'dlq-source-offset': message.offset,
            'dlq-failed-at': new Date().toISOString(),
          },
        },
      ],
    });
  };
}
