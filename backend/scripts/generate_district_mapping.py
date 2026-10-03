"""Build data/district_to_subdivision_mapping.csv.

Maps every (State, District) in crop_production.csv to the IMD meteorological
subdivision whose rainfall series represents it. Single-subdivision states are
mapped by state; multi-subdivision states are mapped district by district
(subdivision membership follows IMD's district rainfall distribution list).

Edit the tables below (or the generated CSV) if you want to change an assignment.
Run:  python scripts/generate_district_mapping.py
"""
from __future__ import annotations

import csv
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"

# State -> subdivision for states that sit entirely inside one IMD subdivision
SINGLE = {
    "Andaman and Nicobar Islands": "ANDAMAN & NICOBAR ISLANDS",
    "Arunachal Pradesh": "ARUNACHAL PRADESH",
    "Assam": "ASSAM & MEGHALAYA", "Meghalaya": "ASSAM & MEGHALAYA",
    "Bihar": "BIHAR", "Chhattisgarh": "CHHATTISGARH",
    "Goa": "KONKAN & GOA",
    "Haryana": "HARYANA DELHI & CHANDIGARH", "Chandigarh": "HARYANA DELHI & CHANDIGARH",
    "Himachal Pradesh": "HIMACHAL PRADESH", "Jammu and Kashmir": "JAMMU & KASHMIR",
    "Jharkhand": "JHARKHAND", "Kerala": "KERALA", "Odisha": "ORISSA",
    "Punjab": "PUNJAB", "Tamil Nadu": "TAMIL NADU", "Puducherry": "TAMIL NADU",
    "Uttarakhand": "UTTARAKHAND", "Telangana": "TELANGANA",
    "Manipur": "NAGA MANI MIZO TRIPURA", "Mizoram": "NAGA MANI MIZO TRIPURA",
    "Nagaland": "NAGA MANI MIZO TRIPURA", "Tripura": "NAGA MANI MIZO TRIPURA",
    "Sikkim": "SUB HIMALAYAN WEST BENGAL & SIKKIM",
    "Dadra and Nagar Haveli": "GUJARAT REGION",
}

# Multi-subdivision states: (default subdivision, {subdivision: [districts]})
MULTI = {
    "Maharashtra": (None, {
        "KONKAN & GOA": ["MUMBAI", "PALGHAR", "RAIGAD", "RATNAGIRI", "SINDHUDURG", "THANE"],
        "MADHYA MAHARASHTRA": ["AHMEDNAGAR", "DHULE", "JALGAON", "KOLHAPUR", "NANDURBAR",
                               "NASHIK", "PUNE", "SANGLI", "SATARA", "SOLAPUR"],
        "MATATHWADA": ["AURANGABAD", "BEED", "HINGOLI", "JALNA", "LATUR", "NANDED",
                       "OSMANABAD", "PARBHANI"],
        "VIDARBHA": ["AKOLA", "AMRAVATI", "BHANDARA", "BULDHANA", "CHANDRAPUR", "GADCHIROLI",
                     "GONDIA", "NAGPUR", "WARDHA", "WASHIM", "YAVATMAL"],
    }),
    "Karnataka": ("SOUTH INTERIOR KARNATAKA", {
        "COASTAL KARNATAKA": ["DAKSHIN KANNAD", "UDUPI", "UTTAR KANNAD"],
        "NORTH INTERIOR KARNATAKA": ["BAGALKOT", "BELGAUM", "BIDAR", "BIJAPUR", "DHARWAD", "GADAG",
                                     "GULBARGA", "HAVERI", "KOPPAL", "RAICHUR", "YADGIR"],
    }),
    "Andhra Pradesh": (None, {
        "COASTAL ANDHRA PRADESH": ["EAST GODAVARI", "GUNTUR", "KRISHNA", "PRAKASAM", "SPSR NELLORE",
                                   "SRIKAKULAM", "VISAKHAPATANAM", "VIZIANAGARAM", "WEST GODAVARI"],
        "RAYALSEEMA": ["ANANTAPUR", "CHITTOOR", "KADAPA", "KURNOOL"],
    }),
    "Madhya Pradesh": ("EAST MADHYA PRADESH", {
        "WEST MADHYA PRADESH": [
            "AGAR MALWA", "ALIRAJPUR", "ASHOKNAGAR", "BARWANI", "BETUL", "BHIND", "BHOPAL",
            "BURHANPUR", "DATIA", "DEWAS", "DHAR", "GUNA", "GWALIOR", "HARDA", "HOSHANGABAD",
            "INDORE", "JHABUA", "KHANDWA", "KHARGONE", "MANDSAUR", "MORENA", "NEEMUCH", "RAISEN",
            "RAJGARH", "RATLAM", "SEHORE", "SHAJAPUR", "SHEOPUR", "SHIVPURI", "UJJAIN", "VIDISHA"],
    }),
    "Uttar Pradesh": ("EAST UTTAR PRADESH", {
        "WEST UTTAR PRADESH": [
            "AGRA", "ALIGARH", "AMROHA", "AURAIYA", "BAGHPAT", "BAREILLY", "BIJNOR", "BUDAUN",
            "BULANDSHAHR", "ETAH", "ETAWAH", "FIROZABAD", "GAUTAM BUDDHA NAGAR", "GHAZIABAD",
            "HAMIRPUR", "HAPUR", "HATHRAS", "JALAUN", "JHANSI", "KASGANJ", "LALITPUR", "MAHOBA",
            "MAINPURI", "MATHURA", "MEERUT", "MORADABAD", "MUZAFFARNAGAR", "PILIBHIT", "RAMPUR",
            "SAHARANPUR", "SAMBHAL", "SHAHJAHANPUR", "SHAMLI"],
    }),
    "Rajasthan": ("EAST RAJASTHAN", {
        "WEST RAJASTHAN": ["BARMER", "BIKANER", "CHURU", "GANGANAGAR", "HANUMANGARH", "JAISALMER",
                           "JALORE", "JODHPUR", "NAGAUR", "PALI"],
    }),
    "West Bengal": ("GANGETIC WEST BENGAL", {
        "SUB HIMALAYAN WEST BENGAL & SIKKIM": ["COOCHBEHAR", "DARJEELING", "DINAJPUR DAKSHIN",
                                               "DINAJPUR UTTAR", "JALPAIGURI", "MALDAH"],
    }),
    "Gujarat": ("GUJARAT REGION", {
        "SAURASHTRA & KUTCH": ["AMRELI", "BHAVNAGAR", "JAMNAGAR", "JUNAGADH", "KACHCHH",
                               "PORBANDAR", "RAJKOT", "SURENDRANAGAR"],
    }),
}


def lookup(state: str, district: str) -> str | None:
    if state in SINGLE:
        return SINGLE[state]
    if state in MULTI:
        default, table = MULTI[state]
        for sub, districts in table.items():
            if district in districts:
                return sub
        return default
    return None


def main() -> None:
    pairs = set()
    with open(DATA / "crop_production.csv", newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            pairs.add((r["State_Name"].strip(), r["District_Name"].strip()))
    rows, unmapped = [], []
    for state, district in sorted(pairs):
        sub = lookup(state, district)
        (rows if sub else unmapped).append((state, district, sub))
    with open(DATA / "district_to_subdivision_mapping.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["State", "District", "Subdivision"])
        for state, district, sub in rows:
            w.writerow([state, district, sub.title().replace("&", "&")])
    print(f"mapped {len(rows)} districts; unmapped {len(unmapped)}")
    for u in unmapped:
        print("  unmapped:", u[:2])


if __name__ == "__main__":
    main()
