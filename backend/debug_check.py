import sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from app import create_app
app = create_app()
with app.app_context():
    from app.models.tla3bny import Tla3bnyUser, Tla3bnyTeam, Tla3bnyCompetitionAge, Tla3bnyCompetitionTeam
    print("=== TEAMS ===")
    teams = Tla3bnyTeam.query.all()
    for t in teams:
        print(f"  id={t.id} name={t.display_name()} age_cat_id={t.age_category_id} academy_id={t.academy_id}")
    print()
    print("=== COMPETITION AGES (sub-comps) ===")
    cages = Tla3bnyCompetitionAge.query.all()
    for c in cages:
        print(f"  id={c.id} name={c.name} age_cat_id={c.age_category_id} comp_id={c.competition_id}")
    print()
    print("=== COMPETITION TEAM ENTRIES ===")
    entries = Tla3bnyCompetitionTeam.query.all()
    for e in entries:
        print(f"  team_id={e.team_id} comp_id={e.competition_id} status={e.status} age_cat_id={e.age_category_id}")
    print()
    print("=== JOINABLE for team 6 ===")
    team = Tla3bnyTeam.query.get(6)
    from app.models.tla3bny import Tla3bnyCompetition
    existing = {e.competition_id for e in Tla3bnyCompetitionTeam.query.filter_by(team_id=6).all()}
    print(f"  team age_cat_id={team.age_category_id}, existing_comp_ids={existing}")
    cages = (
        Tla3bnyCompetitionAge.query
        .join(Tla3bnyCompetitionAge.competition)
        .filter(
            Tla3bnyCompetitionAge.age_category_id == team.age_category_id,
            Tla3bnyCompetition.id.notin_(existing),
        ).all()
    )
    print(f"  Result: {[(c.id, c.name, c.age_category_id) for c in cages]}")
