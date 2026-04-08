"""
Users router — add, update, delete API key users.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from database import get_all_users, get_user, add_user, delete_user

router = APIRouter()


class UserIn(BaseModel):
    key:  str
    name: str
    role: str = "user"


@router.get("/users")
async def list_users():
    return get_all_users()


@router.post("/users")
async def create_user(body: UserIn):
    if not body.key.strip() or not body.name.strip():
        raise HTTPException(status_code=400, detail="key and name are required")
    add_user(body.key.strip(), body.name.strip(), body.role)
    return {"success": True, "key": body.key}


@router.delete("/users/{key}")
async def remove_user(key: str):
    if not get_user(key):
        raise HTTPException(status_code=404, detail="User not found")
    delete_user(key)
    return {"success": True}
