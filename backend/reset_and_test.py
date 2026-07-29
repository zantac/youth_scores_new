import sys, requests
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from app import create_app
from app.models.tla3bny import Tla3bnyUser
from app.extensions import db

app = create_app()
BASE = "http://localhost:5000/api/tla3bny"

with app.app_context():
    # Reset elattar password to test123
    u = Tla3bnyUser.query.filter_by(username="elattar").first()
    if u:
        u.set_password("test123")
        db.session.commit()
        print("Reset elattar password to test123")

# Now test login
r = requests.post(f"{BASE}/auth/login", json={"username": "elattar", "password": "test123"})
print(f"Login: {r.status_code} {r.text[:200]}")
if r.status_code == 200:
    token = r.json().get("token")
    # Test joinable for team 6
    jr = requests.get(f"{BASE}/teams/6/joinable-competitions",
                      headers={"Authorization": f"Bearer {token}"})
    print(f"Joinable team 6: {jr.status_code}")
    print(jr.text)
