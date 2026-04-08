# EXO Dashboard

> A self-hosted usage tracking dashboard for your local EXO AI cluster. Know who's using your models, how much, and when.

If you're running [EXO](https://github.com/exo-explore/exo) on Apple Silicon and sharing it with a team, you have no visibility into who's calling your models or how much they're using. This fixes that.

## What this does

EXO gives you the raw power. This dashboard sits in front of it and gives you:

- **API key management** — issue keys to teammates, revoke them anytime
- **Per-user tracking** — see exactly who sent how many requests and used how many tokens
- **Usage timeline** — daily charts, hourly heatmaps, 7/14/30 day views
- **OpenAI-compatible proxy** — one line change in your existing code, nothing else breaks
- **CSV export** — pull all usage data for billing or reporting
- **SQLite storage** — all data persists across restarts, no external database needed

## The hardware context

This was built for a 2× Mac Studio M3 Ultra cluster (512GB each, 1TB combined) running [Kimi K2.5](https://huggingface.co/mlx-community/Kimi-K2.5) — a 1 trillion parameter model — via EXO with RDMA over Thunderbolt 5.

Equivalent NVIDIA setup: ~$780,000. Mac cluster: ~$24,000. Same inference capability for frontier open-weight models like Kimi K2.5, DeepSeek V3.1, and Qwen3.

## Setup

```bash
git clone https://github.com/yourname/exo-dashboard
cd exo-dashboard
pip3 install -r requirements.txt
cd server
python3 main.py
```

Open `http://localhost:8000`

## Configuration

Edit `server/config.py`:

```python
EXO_BASE_URL = "http://YOUR_MAC_STUDIO_IP:52415"
PORT = 8000
```

## Usage

Point your existing OpenAI-compatible code at the dashboard instead of EXO directly:

```python
# Before
api_base = "http://192.168.x.x:52415/v1"
api_key  = "local"

# After
api_base = "http://192.168.x.x:8000/v1"
api_key  = "your_username"
model    = "mlx-community/Kimi-K2.5"
```

Nothing else changes. The dashboard forwards every request to EXO and logs it.

## Project structure

```
exo-dashboard/
├── frontend/
│   ├── js/main.js          # All frontend logic and charts
│   ├── style/base.css      # Global styles
│   ├── style/sidebar.css   # Sidebar
│   └── index.html          # Entry point
└── server/
    ├── routers/
    │   ├── proxy.py        # Request forwarding + usage logging
    │   ├── stats.py        # Stats API
    │   ├── users.py        # User management
    │   └── export.py       # CSV export
    ├── config.py           # All config in one place
    ├── database.py         # SQLite — swap to Postgres by editing this file only
    └── main.py             # FastAPI entry point
```

## Requirements

- macOS Tahoe 26.2+
- 2× Mac Studio M3 Ultra (or any EXO-compatible cluster)
- Thunderbolt 5 cable for RDMA
- EXO 1.0+ running on the cluster
- Python 3.9+

## Why not just use EXO's built-in dashboard?

EXO's dashboard shows you what's running. This shows you who's using it and how much. If you're sharing your cluster with a team — or just want accountability — you need both.

## Stack

- Backend: FastAPI + SQLite
- Frontend: vanilla JS + Chart.js
- Proxy: httpx async streaming
- No npm, no build step, no Docker required
