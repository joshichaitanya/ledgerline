# Kafka

Local Kafka runs via `docker-compose.yml` (service name: `kafka`).

## List topics
```
docker compose exec kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list
```

## Get message count for a topic
```
docker compose exec kafka /opt/kafka/bin/kafka-get-offsets.sh --broker-list localhost:9092 --topic transactions
```

## Consume messages from a topic
```
docker compose exec kafka /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic transactions --from-beginning
```

## Delete a topic (clears its messages)
```
docker compose exec kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --delete --topic transactions
```

## Describe a topic (check partition count)
```
docker compose exec kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --describe --topic transactions
```

## Partitions vs consumer replicas
`transactions` is created with 2 partitions (see `create-transaction-service`'s `kafka.service.ts`). A Kafka consumer group can have at most one *active* consumer per partition — `transaction-consumer-service` runs 2 replicas by default (`deploy.replicas: 2`); any replica beyond the partition count sits idle.

## Push vs poll consumption patterns
Two consumer services demonstrate the two ways to read from Kafka:
- `transaction-consumer-service` — push-style, uses `kafkajs`'s `eachMessage` callback. kafkajs runs a continuous internal fetch loop and invokes the callback the instant a message is available (near-instant processing).
- `transaction-polling-consumer-service` — pull-style, stays connected but pauses/resumes fetching on a cron schedule (`POLL_CRON_SCHEDULE`, standard 5-field cron syntax with an optional 6th seconds field via `node-cron`, e.g. `*/10 * * * * *` = every 10 seconds; `*/1 * * * *` = every minute is the production-typical granularity). Messages sit in Kafka until the next cron tick rather than being processed instantly. Uses its own separate `groupId`, so it independently receives its own full copy of every message rather than competing for partitions with `transaction-consumer-service`.
