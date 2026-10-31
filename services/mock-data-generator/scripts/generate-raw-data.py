import json
import random
import sys
from faker import Faker

fake = Faker()

# Usage:
# python generate_transactions.py 1000000

NUM_RECORDS = int(sys.argv[1]) if len(sys.argv) > 1 else 1000

with open("./../command-api-service/src/data/categories.json", "r") as f:
    categories = json.load(f)

with open("./../command-api-service/src/data/users.json", "r") as f:
    users = json.load(f)

SUBCATEGORY_IDS = [
    sub["id"]
    for category in categories
    for sub in category.get("subcategories", [])
]

USER_IDS = [user["id"] for user in users]

with open("../command-api-service/src/data/transactions.json", "w") as f:
    f.write("[\n")

    for i in range(NUM_RECORDS):
        transaction = {
            "transactionId": fake.uuid4(),
            "userId": random.choice(USER_IDS),
            "subCategoryId": random.choice(SUBCATEGORY_IDS),
            "amount": round(random.uniform(10, 10000), 2),
            "description": fake.sentence(nb_words=4),
            "transactionDate": fake.date_time_between(
                start_date="-2y",
                end_date="now"
            ).isoformat()
        }

        json.dump(transaction, f)

        if i != NUM_RECORDS - 1:
            f.write(",\n")

    f.write("\n]")

print(f"Generated {NUM_RECORDS:,} transactions -> transactions.json")
