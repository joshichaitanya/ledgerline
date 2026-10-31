import json
import sys
from faker import Faker

fake = Faker()

# Usage:
# python generate-users.py 1000

NUM_USERS = int(sys.argv[1]) if len(sys.argv) > 1 else 100

users = []
for i in range(1, NUM_USERS + 1):
    users.append({
        "id": i,
        "name": fake.name(),
        "email": fake.email(),
        "phone": fake.phone_number(),
        "city": fake.city(),
        "country": fake.country()
    })

with open("../command-api-service/src/data/users.json", "w") as f:
    json.dump(users, f, indent=2)

print(f"Generated {NUM_USERS:,} users -> users.json")
