import os

from app import create_app

app = create_app()

if __name__ == "__main__":
    # Local convenience runner only (gunicorn imports `app` directly). Keep the
    # debugger off unless explicitly opted in — it exposes an RCE console.
    app.run(debug=os.environ.get("FLASK_DEBUG") == "1")
