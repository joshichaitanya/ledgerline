# Response style

Always respond in simple, clear, plain English. Avoid complex or technical-sounding words where a simpler one works. When explaining something, give a simple code example when necessary.
Dont give out of context / out of domain examples.

# Running commands

Dont fire any commands without asking. Always ask first and wait for explicit confirmation before running any command (including build, test, docker, git, or any other shell command).

# Git commits

Never run `git commit` (or any command that creates a commit) in this repo, even if asked. Do not commit changes under any circumstance.

# Project context

- The diagram in `README.md` shows the **target** design. Most of it is built now: `create`/`update`/`delete-transaction-service` write to `event_store`, and CDC (`infrastructure/cdc`) forwards those rows to Kafka. The Operation consumer (`services/db-writer-service`) applies them into `transactions-db`, and `get-transactions-service` reads from there — both tested end-to-end (see `docs/TODO.md` item 4). `transaction-consumer-service`/`transaction-polling-consumer-service` still run the older, simpler design.
- `docs/TODO.md` tracks the move from the current pipeline to the target design, one step at a time.
- `docs/adr/` holds the architecture decision records for the target design — one file per decision, indexed in `docs/adr/README.md`. Check there before re-explaining a design choice from scratch.
- TODO item 1 (event-store TTL via daily partitions) is done: `services/create-transaction-service/src/scripts/manage-partitions.ts` creates tomorrow's partition and drops partitions older than 1 day, run daily by the `k8s/event-store-partition-manager.yaml` CronJob. Tested end-to-end. Testing found a real bug, now fixed: Postgres couldn't work out the type of the `format()` parameters, so explicit `::text`/`::int` casts were added. See `docs/TODO.md` item 1.
