"""India state / crop reference used for metadata, calendars and soft ranking."""

from __future__ import annotations

STATES = (
    "Andhra Pradesh",
    "Assam",
    "Bihar",
    "Gujarat",
    "Haryana",
    "Karnataka",
    "Kerala",
    "Madhya Pradesh",
    "Maharashtra",
    "Odisha",
    "Punjab",
    "Rajasthan",
    "Tamil Nadu",
    "Telangana",
    "Uttar Pradesh",
    "West Bengal",
)

# slug -> display name / type / primary season / approx sow & harvest months (0=Jan)
CROP_META = {
    "rice": {"name": "Rice", "type": "Cereal", "season": "kharif", "sow": [5, 6], "harvest": [8, 9], "days": 120},
    "wheat": {"name": "Wheat", "type": "Cereal", "season": "rabi", "sow": [9, 10], "harvest": [2, 3], "days": 120},
    "maize": {"name": "Maize", "type": "Cereal", "season": "kharif", "sow": [5, 6], "harvest": [8, 9], "days": 100},
    "sugarcane": {"name": "Sugarcane", "type": "Sugar crop", "season": "kharif", "sow": [1, 2], "harvest": [11, 0], "days": 360},
    "cotton": {"name": "Cotton", "type": "Fibre crop", "season": "kharif", "sow": [4, 5], "harvest": [9, 10], "days": 160},
    "jute": {"name": "Jute", "type": "Fibre crop", "season": "kharif", "sow": [2, 3], "harvest": [6, 7], "days": 120},
    "groundnut": {"name": "Groundnut", "type": "Oilseed", "season": "kharif", "sow": [5, 6], "harvest": [8, 9], "days": 110},
    "soybean": {"name": "Soybean", "type": "Oilseed", "season": "kharif", "sow": [5, 6], "harvest": [8, 9], "days": 100},
    "mustard": {"name": "Mustard", "type": "Oilseed", "season": "rabi", "sow": [9, 10], "harvest": [1, 2], "days": 110},
    "gram": {"name": "Gram", "type": "Pulse", "season": "rabi", "sow": [9, 10], "harvest": [1, 2], "days": 110},
    "lentil": {"name": "Lentil", "type": "Pulse", "season": "rabi", "sow": [9, 10], "harvest": [1, 2], "days": 110},
    "potato": {"name": "Potato", "type": "Vegetable", "season": "rabi", "sow": [9, 10], "harvest": [0, 1], "days": 90},
    "banana": {"name": "Banana", "type": "Fruit", "season": "kharif", "sow": [5, 6], "harvest": [11, 0], "days": 300},
    "coconut": {"name": "Coconut", "type": "Plantation", "season": "kharif", "sow": [4, 5], "harvest": [11, 0], "days": 365},
    "coffee": {"name": "Coffee", "type": "Plantation", "season": "kharif", "sow": [5, 6], "harvest": [10, 11], "days": 240},
    "tea": {"name": "Tea", "type": "Plantation", "season": "kharif", "sow": [2, 3], "harvest": [11, 0], "days": 300},
    "tobacco": {"name": "Tobacco", "type": "Cash crop", "season": "kharif", "sow": [7, 8], "harvest": [0, 1], "days": 120},
    "chilli": {"name": "Chilli", "type": "Spice", "season": "kharif", "sow": [5, 6], "harvest": [8, 9], "days": 120},
    "turmeric": {"name": "Turmeric", "type": "Spice", "season": "kharif", "sow": [4, 5], "harvest": [0, 1], "days": 240},
    "bajra": {"name": "Bajra", "type": "Millet", "season": "kharif", "sow": [5, 6], "harvest": [8, 9], "days": 90},
    "jowar": {"name": "Jowar", "type": "Millet", "season": "kharif", "sow": [5, 6], "harvest": [8, 9], "days": 110},
    "ragi": {"name": "Ragi", "type": "Millet", "season": "kharif", "sow": [5, 6], "harvest": [8, 9], "days": 110},
    "barley": {"name": "Barley", "type": "Cereal", "season": "rabi", "sow": [9, 10], "harvest": [2, 3], "days": 110},
    "sesame": {"name": "Sesame", "type": "Oilseed", "season": "kharif", "sow": [5, 6], "harvest": [8, 9], "days": 90},
    "rubber": {"name": "Rubber", "type": "Plantation", "season": "kharif", "sow": [4, 5], "harvest": [11, 0], "days": 365},
}

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def crop_slug(name: str) -> str:
    return name.strip().lower().replace(" ", "")


def month_span(indexes: list[int]) -> str:
    labels = [MONTHS[i] for i in indexes]
    if not labels:
        return "—"
    if len(labels) == 1:
        return labels[0]
    return f"{labels[0]}–{labels[-1]}"
