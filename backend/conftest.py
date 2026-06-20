"""Shared pytest fixtures — load .env so in-process imports work."""
import os
from pathlib import Path

from dotenv import load_dotenv

# Load /app/backend/.env so tests that import modules using os.environ at
# import time (e.g. oauth_flow Fernet, midi MongoDB) can read MONGO_URL,
# FERNET_KEY, etc. when run from any cwd.
load_dotenv(Path(__file__).resolve().parent / ".env")

# Make the backend package importable even if pytest was launched from /app.
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
