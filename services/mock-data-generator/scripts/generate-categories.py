import json
import uuid

CATEGORY_NAMES = [
    ("Food & Dining", ["Groceries", "Restaurants", "Cafe", "Food Delivery", "Snacks"]),
    ("Transport", ["Fuel", "Public Transport", "Cab / Taxi", "Parking", "Tolls", "Vehicle Maintenance"]),
    ("Shopping", ["Clothing", "Electronics", "Home & Kitchen", "Gifts", "Personal Care"]),
    ("Bills & Utilities", ["Rent", "Electricity", "Water", "Gas", "Internet", "Mobile"]),
    ("Health", ["Doctor", "Medicine", "Insurance", "Fitness", "Lab Tests"]),
    ("Entertainment", ["Movies", "OTT Subscriptions", "Gaming", "Events", "Books"]),
    ("Travel", ["Flights", "Hotels", "Local Transport", "Activities", "Visa"]),
    ("Education", ["Courses", "Books", "Certifications", "Software"]),
    ("Family", ["Kids", "Parents", "Pets", "Household"]),
    ("Finance", ["Loan EMI", "Investment", "Tax", "Bank Charges"]),
    ("Income", ["Salary", "Bonus", "Freelance", "Interest", "Refund", "Other Income"]),
    ("Other", ["Donation", "Fees", "Miscellaneous"]),
]

CATEGORIES = [
    {
        "id": str(uuid.uuid4()),
        "name": name,
        "subcategories": [
            {"id": str(uuid.uuid4()), "name": sub_name}
            for sub_name in sub_names
        ]
    }
    for name, sub_names in CATEGORY_NAMES
]

with open("../command-api-service/src/data/categories.json", "w") as f:
    json.dump(CATEGORIES, f, indent=2)

print(f"Generated {len(CATEGORIES)} categories -> categories.json")
