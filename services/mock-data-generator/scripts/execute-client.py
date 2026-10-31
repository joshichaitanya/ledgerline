import json
import requests

API_URL = "http://localhost:3000/transactions"

with open("../command-api-service/src/data/transactions.json", "r") as f:
    transactions = json.load(f)

for transaction in transactions:
    response = requests.post(API_URL, json=[transaction])
    print(f"{transaction['transactionId']} -> {response.status_code}")

print(f"Posted {len(transactions)} transactions")
