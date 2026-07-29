import sys, requests
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = "http://localhost:5000/api/tla3bny"

# Try logging in as each academy user to find who can see joinable comps
for username, password in [("elattar", "123456"), ("actest1", "123456"), ("admin", "123456")]:
    r = requests.post(f"{BASE}/auth/login", json={"username": username, "password": password})
    if r.status_code != 200:
        print(f"{username}: login failed {r.status_code} {r.text[:100]}")
        continue
    token = r.json().get("token")
    print(f"{username}: logged in, token={token[:20] if token else None}...")

    # Find teams for this user
    me = requests.get(f"{BASE}/auth/me", headers={"Authorization": f"Bearer {token}"})
    if me.status_code == 200:
        data = me.json()
        role = data.get("role")
        acad = data.get("academy", {})
        teams = acad.get("teams", []) if acad else []
        print(f"  role={role}, teams={[(t['id'], t.get('display_name','?')) for t in teams]}")

        for team in teams:
            tid = team["id"]
            jr = requests.get(f"{BASE}/teams/{tid}/joinable-competitions",
                              headers={"Authorization": f"Bearer {token}"})
            print(f"  team {tid}: status={jr.status_code} body={jr.text[:200]}")
    print()
