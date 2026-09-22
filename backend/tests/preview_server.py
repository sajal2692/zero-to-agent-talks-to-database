"""Runs the backend with the scripted model, so the frontend can be tried without an API key.

From backend/, with the database container running:
    uv run python tests/preview_server.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import scripted_model  # noqa: E402,F401
import uvicorn  # noqa: E402

import main  # noqa: E402

uvicorn.run(main.app, host="127.0.0.1", port=8000)
