"""
Stats router — returns usage data for the dashboard frontend.
"""

from datetime import datetime
from fastapi import APIRouter

from database import (
    get_all_users,
    get_user_stats,
    get_user_history,
    get_daily_counts,
    get_hourly_counts_today,
)

router = APIRouter()


@router.get("")
async def all_stats():
    users = get_all_users()
    result = {}
    total_requests = 0
    total_tokens_out = 0

    for u in users:
        key = u["key"]
        stats = get_user_stats(key)
        history = get_user_history(key, limit=50)

        result[key] = {
            "name":        u["name"],
            "role":        u["role"],
            "requests":    stats["requests"],
            "tokens_in":   stats["tokens_in"],
            "tokens_out":  stats["tokens_out"],
            "last_used":   stats["last_used"],
            "history":     history,
        }
        total_requests  += stats["requests"]
        total_tokens_out += stats["tokens_out"]

    return {
        "users":            result,
        "total_requests":   total_requests,
        "total_tokens_out": total_tokens_out,
        "generated_at":     datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }


@router.get("/daily")
async def daily_stats(days: int = 7):
    return get_daily_counts(days)


@router.get("/hourly")
async def hourly_stats():
    raw = get_hourly_counts_today()
    # Fill all 24 hours so the frontend always gets a complete array
    counts = {r["hour"]: r["requests"] for r in raw}
    return [{"hour": h, "requests": counts.get(h, 0)} for h in range(24)]
