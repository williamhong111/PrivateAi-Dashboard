"""
Database setup and helpers.
All SQLite logic lives here — swap to PostgreSQL later by only changing this file.
"""

import sqlite3
from contextlib import contextmanager
from config import DB_FILE, DEFAULT_USERS


@contextmanager
def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    """Create tables and insert default users if they don't exist."""
    with get_db() as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                key        TEXT PRIMARY KEY,
                name       TEXT NOT NULL,
                role       TEXT NOT NULL DEFAULT 'user',
                model      TEXT NOT NULL DEFAULT 'mlx-community/Kimi-K2.5',
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            )
        """)
        # Add model column to users if upgrading from older version
        try:
            db.execute("ALTER TABLE users ADD COLUMN model TEXT NOT NULL DEFAULT 'mlx-community/Kimi-K2.5'")
        except Exception:
            pass

        db.execute("""
            CREATE TABLE IF NOT EXISTS request_logs (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                user_key   TEXT NOT NULL,
                path       TEXT,
                model      TEXT NOT NULL DEFAULT '',
                tokens_in  INTEGER NOT NULL DEFAULT 0,
                tokens_out INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                FOREIGN KEY (user_key) REFERENCES users(key)
            )
        """)

        # Add model column to request_logs if upgrading from older version
        try:
            db.execute("ALTER TABLE request_logs ADD COLUMN model TEXT NOT NULL DEFAULT ''")
        except Exception:
            pass

        # Index for fast date-range queries on the timeline page
        db.execute("""
            CREATE INDEX IF NOT EXISTS idx_logs_user_date
            ON request_logs (user_key, created_at)
        """)

        # Index for fast model queries
        db.execute("""
            CREATE INDEX IF NOT EXISTS idx_logs_model
            ON request_logs (model)
        """)

        # Insert default users
        for u in DEFAULT_USERS:
            db.execute(
                "INSERT OR IGNORE INTO users (key, name, role) VALUES (?, ?, ?)",
                (u["key"], u["name"], u["role"])
            )

    print(f"[DB] Initialized — {DB_FILE}")


# ── User helpers ──────────────────────────────────────────────────────────────

def get_all_users() -> list[dict]:
    with get_db() as db:
        rows = db.execute("SELECT * FROM users ORDER BY created_at").fetchall()
        return [dict(r) for r in rows]


def get_user(key: str) -> dict:
    with get_db() as db:
        row = db.execute("SELECT * FROM users WHERE key = ?", (key,)).fetchone()
        return dict(row) if row else None


def add_user(key: str, name: str, role: str = "user", model: str = "mlx-community/Kimi-K2.5") -> None:
    with get_db() as db:
        db.execute(
            "INSERT OR REPLACE INTO users (key, name, role, model) VALUES (?, ?, ?, ?)",
            (key, name, role, model)
        )


def delete_user(key: str) -> None:
    with get_db() as db:
        db.execute("DELETE FROM users WHERE key = ?", (key,))


# ── Request log helpers ───────────────────────────────────────────────────────

def log_request(user_key: str, path: str, tokens_in: int, tokens_out: int, model: str = "") -> None:
    with get_db() as db:
        db.execute(
            "INSERT INTO request_logs (user_key, path, model, tokens_in, tokens_out) VALUES (?, ?, ?, ?, ?)",
            (user_key, path, model, tokens_in, tokens_out)
        )


def get_user_stats(user_key: str) -> dict:
    """Aggregate totals for one user."""
    with get_db() as db:
        row = db.execute("""
            SELECT
                COUNT(*)              AS requests,
                COALESCE(SUM(tokens_in),  0) AS tokens_in,
                COALESCE(SUM(tokens_out), 0) AS tokens_out,
                MAX(created_at)       AS last_used
            FROM request_logs
            WHERE user_key = ?
        """, (user_key,)).fetchone()
        return dict(row) if row else {"requests": 0, "tokens_in": 0, "tokens_out": 0, "last_used": None}


def get_user_history(user_key: str, limit: int = 50) -> list[dict]:
    with get_db() as db:
        rows = db.execute("""
            SELECT created_at, path, model, tokens_in, tokens_out
            FROM request_logs
            WHERE user_key = ?
            ORDER BY id DESC
            LIMIT ?
        """, (user_key, limit)).fetchall()
        return [dict(r) for r in rows]


def get_daily_counts(days: int = 30) -> list[dict]:
    """Return request counts grouped by date for the last N days."""
    with get_db() as db:
        rows = db.execute("""
            SELECT
                DATE(created_at)  AS day,
                user_key,
                COUNT(*)          AS requests,
                SUM(tokens_out)   AS tokens_out
            FROM request_logs
            WHERE created_at >= datetime('now', ?)
            GROUP BY day, user_key
            ORDER BY day
        """, (f"-{days} days",)).fetchall()
        return [dict(r) for r in rows]


def get_hourly_counts_today() -> list[dict]:
    """Return request counts per hour for today."""
    with get_db() as db:
        rows = db.execute("""
            SELECT
                CAST(strftime('%H', created_at) AS INTEGER) AS hour,
                COUNT(*) AS requests
            FROM request_logs
            WHERE DATE(created_at) = DATE('now', 'localtime')
            GROUP BY hour
            ORDER BY hour
        """).fetchall()
        return [dict(r) for r in rows]


def get_model_stats() -> list[dict]:
    """Aggregate totals grouped by model."""
    with get_db() as db:
        rows = db.execute("""
            SELECT
                CASE
                    WHEN l.model = '' OR l.model IS NULL THEN u.model
                    ELSE l.model
                END AS model,
                COUNT(*)                       AS requests,
                COALESCE(SUM(l.tokens_in),  0) AS tokens_in,
                COALESCE(SUM(l.tokens_out), 0) AS tokens_out
            FROM request_logs l
            JOIN users u ON l.user_key = u.key
            GROUP BY 1
            ORDER BY requests DESC
        """).fetchall()
        return [dict(r) for r in rows]


def export_all_csv() -> str:
    """Return all logs as a CSV string."""
    with get_db() as db:
        rows = db.execute("""
            SELECT l.created_at, u.name, u.key,
                   CASE WHEN l.model = '' OR l.model IS NULL THEN u.model ELSE l.model END AS model,
                   l.path, l.tokens_in, l.tokens_out
            FROM request_logs l
            JOIN users u ON l.user_key = u.key
            ORDER BY l.id DESC
        """).fetchall()
    lines = ["time,name,key,model,path,tokens_in,tokens_out"]
    for r in rows:
        lines.append(f"{r['created_at']},{r['name']},{r['key']},{r['model']},{r['path']},{r['tokens_in']},{r['tokens_out']}")
    return "\n".join(lines)
