"""
All configuration lives here.
Change EXO_BASE_URL to point to your Mac Studio's IP.
"""

# EXO server address
EXO_BASE_URL = "http://192.168.50.139:52415"

# Dashboard server setting
HOST = "0.0.0.0"
PORT = 8000

# Database file location
DB_FILE = "usage.db"

# Default users (key: display name, role)
DEFAULT_USERS = [
    {"key": "will",  "name": "Will",  "role": "admin"},
    {"key": "john",  "name": "John",  "role": "user"},
    {"key": "sarah", "name": "Sarah", "role": "user"},
]

# How many history entries to keep per user
MAX_HISTORY = 200
