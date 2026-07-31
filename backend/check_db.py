import sqlite3
db = r'C:\Users\waell\develop\projects\youth_scores_new\backend\instance\youthscores.rehearsal.db'
conn = sqlite3.connect(db)
cur = conn.cursor()
cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
tables = [r[0] for r in cur.fetchall()]
print('Tables:', tables)
for t in ['seasons', 'tla3bny_seasons', 'competitions', 'venues', 'news']:
    if t in tables:
        cur.execute(f'SELECT COUNT(*) FROM {t}')
        print(f'{t}: {cur.fetchone()[0]} rows')
conn.close()
