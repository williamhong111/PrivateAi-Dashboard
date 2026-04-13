from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from config import HOST, PORT
from database import init_db

app = FastAPI(title="EXO Dashboard")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    init_db()
    print(f"[EXO Dashboard] Running at http://{HOST}:{PORT}")

from routers import proxy, stats, users, export
app.include_router(proxy.router)
app.include_router(stats.router,  prefix="/stats")
app.include_router(users.router,  prefix="/admin")
app.include_router(export.router, prefix="/admin")

@app.get("/")
async def root():
    return FileResponse("../frontend/index.html")

app.mount("/", StaticFiles(directory="../frontend", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=HOST, port=PORT, reload=True)
