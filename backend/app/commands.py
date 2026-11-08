"""Flask CLI commands, e.g. seeding the first super admin.

    flask create-admin --username me --password "secret" --role superadmin --name "..."
"""

import click

from app.extensions import db
from app.models import AdminUser, Tla3bnyUser
from app.models import codes


def register_commands(app):
    @app.cli.command("create-admin")
    @click.option("--username", required=True)
    @click.option("--password", required=True)
    @click.option("--role", default="superadmin", type=click.Choice(codes.ADMIN_ROLE))
    @click.option("--name", default=None, help="Full name (optional)")
    def create_admin(username, password, role, name):
        """Create an admin, or reset the password/role of an existing one."""
        user = AdminUser.query.filter_by(username=username).first()
        if user:
            user.set_password(password)
            user.role = role
            user.is_active = True
            if name:
                user.full_name = name
            action = "updated"
        else:
            user = AdminUser(username=username, full_name=name, role=role)
            user.set_password(password)
            db.session.add(user)
            action = "created"
        db.session.commit()
        click.echo(f"{action} admin '{username}' with role '{role}'")

    @app.cli.command("create-tla3bny-admin")
    @click.option("--username", help="Login name (or pass --email)")
    @click.option("--email", help="Email, which also works as the login")
    @click.option("--password", required=True)
    @click.option("--name", default="League Admin", help="Display name (optional)")
    def create_tla3bny_admin(username, email, password, name):
        """Create/reset the tla3bny (LeagueHub subdomain) super admin account."""
        username = Tla3bnyUser.normalize_login(username or email)
        email = Tla3bnyUser.normalize_login(email)
        if not username:
            raise click.UsageError("give --username or --email")
        user = Tla3bnyUser.by_login(username)
        if user:
            user.set_password(password)
            user.role = "super_admin"
            user.status = "active"
            if name:
                user.name = name
            action = "updated"
        else:
            user = Tla3bnyUser(
                username=username,
                email=email,
                role="super_admin",
                status="active",
                name=name,
            )
            user.set_password(password)
            db.session.add(user)
            action = "created"
        db.session.commit()
        click.echo(f"{action} tla3bny super admin '{username}'")

    @app.cli.command("migrate-player-files-private")
    def migrate_player_files_private():
        """One-time: relocate existing registration documents into the private/
        upload subdir and repoint their DB paths, so old public links stop working
        and every paper is served only through the signed link route.

        Idempotent — rows already under uploads/private/ (and remote/S3 URLs) are
        skipped, so it is safe to run more than once.
        """
        import os
        import shutil

        from app.models import Tla3bnyPlayer, Tla3bnyPlayerFile
        from app.services import storage

        folder = app.config["UPLOAD_FOLDER"]
        priv = os.path.join(folder, "private")
        os.makedirs(priv, exist_ok=True)
        moved = repointed = skipped = 0

        def _relocate(path: str):
            """Move the physical file into private/ (if present) and return the new
            uploads/private/<name> path. Returns None to skip (remote/already-private)."""
            nonlocal moved
            if not path or storage.is_remote(path) or path.startswith("uploads/private/"):
                return None
            name = path.rsplit("/", 1)[-1]
            src = os.path.join(folder, name)
            if os.path.exists(src):
                shutil.move(src, os.path.join(priv, name))
                moved += 1
            return f"uploads/private/{name}"

        for pf in Tla3bnyPlayerFile.query.all():
            new_path = _relocate(pf.file_path or "")
            if new_path is None:
                skipped += 1
                continue
            pf.file_path = new_path
            repointed += 1

        # Legacy per-player primary-paper pointers mirror a document file.
        for p in Tla3bnyPlayer.query.filter(Tla3bnyPlayer.papers_path.isnot(None)).all():
            new_path = _relocate(p.papers_path or "")
            if new_path is not None:
                p.papers_path = new_path
                repointed += 1

        db.session.commit()
        click.echo(
            f"done: moved {moved} files, repointed {repointed} rows, skipped {skipped}"
        )

    @app.cli.command("merge-club")
    @click.option("--from", "from_id", type=int, required=True, help="club to absorb")
    @click.option("--into", "into_id", type=int, required=True, help="club to keep")
    @click.option("--commit", is_flag=True, help="apply (default: dry run)")
    def merge_club(from_id, into_id, commit):
        """Merge one club's teams and staff into another, then delete it.

        Every row that belongs to a team (players, coaches, matches, competition
        entries, group standings) references team_id, not club_id — so moving a
        team to another club is a single teams.club_id change and all of its
        history follows. The only hard case is an age-group collision: if the
        destination club already has a team in the same age group, the two squads
        are merged into the destination team and the emptied source team deleted.

        Dry run by default (prints the plan, writes nothing). Idempotent.
        """
        from app.models import (
            Club,
            CompetitionTeam,
            GroupTeam,
            Match,
            PlayerTeam,
            Team,
            TeamCoach,
        )

        if from_id == into_id:
            raise click.UsageError("--from and --into are the same club")

        src = db.session.get(Club, from_id)
        dst = db.session.get(Club, into_id)
        if src is None:
            raise click.UsageError(f"source club {from_id} not found")
        if dst is None:
            raise click.UsageError(f"destination club {into_id} not found")

        def age_label(team):
            ag = team.age_group
            return (ag.name_ar or ag.name_en or str(ag.oldest_birth_year)) if ag else "?"

        def merge_team_into(s, d):
            """Repoint every child of team `s` onto team `d`, then delete `s`."""
            mh = Match.query.filter_by(home_team_id=s.id).update(
                {Match.home_team_id: d.id}, synchronize_session=False
            )
            ma = Match.query.filter_by(away_team_id=s.id).update(
                {Match.away_team_id: d.id}, synchronize_session=False
            )
            # competition_teams / group_teams carry UNIQUE(scope, team_id): if the
            # destination is already in that competition/group, drop the source row
            # rather than move it into a constraint violation.
            ct_moved = ct_dropped = 0
            for ct in CompetitionTeam.query.filter_by(team_id=s.id).all():
                if CompetitionTeam.query.filter_by(
                    competition_id=ct.competition_id, team_id=d.id
                ).first():
                    db.session.delete(ct)
                    ct_dropped += 1
                else:
                    ct.team_id = d.id
                    ct_moved += 1
            gt_moved = gt_dropped = 0
            for gt in GroupTeam.query.filter_by(team_id=s.id).all():
                if GroupTeam.query.filter_by(group_id=gt.group_id, team_id=d.id).first():
                    db.session.delete(gt)
                    gt_dropped += 1
                else:
                    gt.team_id = d.id
                    gt_moved += 1
            pt = PlayerTeam.query.filter_by(team_id=s.id).update(
                {PlayerTeam.team_id: d.id}, synchronize_session=False
            )
            tc = TeamCoach.query.filter_by(team_id=s.id).update(
                {TeamCoach.team_id: d.id}, synchronize_session=False
            )
            db.session.delete(s)
            click.echo(
                f"  MERGE team {s.id} -> {d.id} (age {age_label(s)}): "
                f"matches {mh}+{ma}, players {pt}, coaches {tc}, "
                f"comp-entries {ct_moved} moved/{ct_dropped} dropped, "
                f"group-memberships {gt_moved} moved/{gt_dropped} dropped"
            )

        click.echo(
            f"Merging club {src.id} ({src.name_ar or src.name_en}) "
            f"-> {dst.id} ({dst.name_ar or dst.name_en})"
        )

        dst_by_age = {t.age_group_id: t for t in dst.teams}
        for team in list(src.teams):
            twin = dst_by_age.get(team.age_group_id)
            if twin is None:
                team.club_id = dst.id
                dst_by_age[team.age_group_id] = team
                click.echo(
                    f"  MOVE  team {team.id} (age {age_label(team)}) -> club {dst.id}"
                )
            else:
                merge_team_into(team, twin)

        # Staff: repoint to the destination club; drop a row that would duplicate a
        # coach the destination club already lists.
        dst_staff = {s.coach_id for s in dst.staff}
        moved = dropped = 0
        for s in list(src.staff):
            if s.coach_id in dst_staff:
                db.session.delete(s)
                dropped += 1
            else:
                s.club_id = dst.id
                dst_staff.add(s.coach_id)
                moved += 1
        if moved or dropped:
            click.echo(f"  STAFF {moved} moved, {dropped} dropped (already on dest)")

        db.session.delete(src)
        click.echo(f"  DELETE club {src.id}")

        if commit:
            db.session.commit()
            click.echo("COMMITTED.")
        else:
            db.session.rollback()
            click.echo("DRY RUN — nothing written. Re-run with --commit to apply.")
