"""
Users router — add, update, delete API key users.
"""

import secrets
import socket
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from database import get_all_users, get_user, add_user, delete_user

router = APIRouter()


def get_local_ip():
    """Get the current machine's local IP address."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "localhost"


class UserIn(BaseModel):
    key:   str
    name:  str
    role:  str = "user"
    model: str = "mlx-community/Kimi-K2.5"

class GenerateIn(BaseModel):
    name:  str
    role:  str = "user"
    model: str = "mlx-community/Kimi-K2.5"


@router.post("/users")
async def create_user(body: UserIn):
    if not body.key.strip() or not body.name.strip():
        raise HTTPException(status_code=400, detail="key and name are required")
    add_user(body.key.strip(), body.name.strip(), body.role, body.model)
    return {"success": True, "key": body.key}


@router.post("/users/generate")
async def generate_user(body: GenerateIn):
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="name is required")
    key = "ek-" + secrets.token_urlsafe(16)
    add_user(key, body.name.strip(), body.role, body.model)
    ip = get_local_ip()
    return {
        "success": True,
        "key": key,
        "name": body.name,
        "model": body.model,
        "ip": ip
    }


@router.delete("/users/{key}")
async def remove_user(key: str):
    if not get_user(key):
        raise HTTPException(status_code=404, detail="User not found")
    delete_user(key)
    return {"success": True}
