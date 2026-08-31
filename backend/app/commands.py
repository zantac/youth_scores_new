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
