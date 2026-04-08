"""
Proxy router — forwards all /v1/* requests to EXO.
Logs usage to the database.
"""

import json
import httpx
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse, Response

from config import EXO_BASE_URL
from database import log_request, get_user

router = APIRouter()


def _extract_key(request: Request) -> str:
    auth = request.headers.get("Authorization", "")
    return auth[7:] if auth.startswith("Bearer ") else None


def _count_tokens_in(body: bytes) -> int:
    try:
        msgs = json.loads(body).get("messages", [])
        return sum(len(m.get("content", "")) for m in msgs) // 4
    except Exception:
        return 0


@router.api_route("/v1/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def proxy(path: str, request: Request):
    key = _extract_key(request)

    # Allow /v1/models without auth
    if path != "models":
        if not key or not get_user(key):
            raise HTTPException(status_code=401, detail="Invalid API key")

    body = await request.body()
    tokens_in = _count_tokens_in(body) if body and key else 0

    hdrs = {k: v for k, v in request.headers.items() if k.lower() != "host"}
    url = f"{EXO_BASE_URL}/v1/{path}"
    if request.query_params:
        url += f"?{request.query_params}"

    is_stream = False
    if body:
        try:
            is_stream = json.loads(body).get("stream", False)
        except Exception:
            pass

    async with httpx.AsyncClient(timeout=300) as client:
        if is_stream:
            async def generate():
                tokens_out = 0
                async with client.stream(request.method, url, headers=hdrs, content=body) as r:
                    async for chunk in r.aiter_bytes():
                        try:
                            tokens_out += chunk.decode().count('"content":"')
                        except Exception:
                            pass
                        yield chunk
                if key:
                    log_request(key, path, tokens_in, tokens_out)

            return StreamingResponse(generate(), media_type="text/event-stream")

        else:
            resp = await client.request(request.method, url, headers=hdrs, content=body)
            tokens_out = 0
            try:
                tokens_out = resp.json().get("usage", {}).get("completion_tokens", 0)
            except Exception:
                pass
            if key:
                log_request(key, path, tokens_in, tokens_out)
            return Response(
                content=resp.content,
                status_code=resp.status_code,
                headers=dict(resp.headers)
            )
