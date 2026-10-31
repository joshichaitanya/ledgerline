#!/bin/sh
# Registers the Debezium Postgres connector with Kafka Connect.
# Kafka Connect only picks up connectors via its REST API - it doesn't read
# event-store-connector.json on its own - so this puts it in.
#
# Uses PUT .../config (not POST .../connectors) so this is safe to re-run:
# PUT creates the connector if it doesn't exist yet, or just updates its
# config if it does. POST would fail with 409 Conflict on a second run,
# which matters since this runs on every deploy/startup, not just once by
# hand - see the "kafka-connect-register" step in docker-compose.yml and
# the Job in k8s/kafka-connect.yaml.
#
# Usage: ./infrastructure/cdc/register-connector.sh
# (assumes Kafka Connect is reachable at localhost:8083, e.g. via
# `docker compose up -d kafka-connect`)

set -eu

CONNECT_URL="${CONNECT_URL:-http://localhost:8083}"
CONFIG_FILE="$(dirname "$0")/event-store-connector.json"
CONNECTOR_NAME="event-store-connector"

curl -sf -X PUT \
  -H "Content-Type: application/json" \
  --data @"$CONFIG_FILE" \
  "$CONNECT_URL/connectors/$CONNECTOR_NAME/config" \
  && echo "\nConnector registered."
