"""Download the demo data into db/data/. Run once. The CSVs it writes are committed to the repo.

Two public-domain (CC0) sources, pinned to the commits the demo was rehearsed against:
- martj42/international_results: every men's international match since 1872, with goalscorers.
- openfootball/worldcup.json: the 48 squads at the 2026 World Cup.
"""

import csv
import json
import urllib.request
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent / "data"
RESULTS_COMMIT = "394fe81893b062fbc2cf6257e988ac7cc4c039a1"  # 2026-08-26
SQUADS_COMMIT = "aa68096aa2a7aa93540e48fe9dfbce14b3dfe548"  # 2026-06-15
RESULTS_URL = f"https://raw.githubusercontent.com/martj42/international_results/{RESULTS_COMMIT}"
SQUADS_URL = f"https://raw.githubusercontent.com/openfootball/worldcup.json/{SQUADS_COMMIT}/2026/worldcup.squads.json"


def download(url):
    request = urllib.request.Request(url, headers={"User-Agent": "zero-to-agent-demo"})
    with urllib.request.urlopen(request) as response:
        return response.read()


DATA_DIR.mkdir(exist_ok=True)

# 1. The four match files, copied as they are.
for name in ("results.csv", "goalscorers.csv", "shootouts.csv", "former_names.csv"):
    (DATA_DIR / name).write_bytes(download(f"{RESULTS_URL}/{name}"))
    print("Saved", name)

# 2. The 2026 squads, flattened from JSON into one row per player.
teams = json.loads(download(SQUADS_URL))
with open(DATA_DIR / "squads_2026.csv", "w", newline="", encoding="utf-8") as f:
    writer = csv.writer(f)
    writer.writerow(["team", "fifa_code", "group_name", "shirt_number", "position", "player",
                     "date_of_birth", "club", "club_country"])
    for team in teams:
        for player in team["players"]:
            club = player.get("club") or {}
            writer.writerow([team["name"], team["fifa_code"], team["group"], player["number"], player["pos"],
                             player["name"], player["date_of_birth"], club.get("name"), club.get("country")])
print("Saved squads_2026.csv,", sum(len(t["players"]) for t in teams), "players")
