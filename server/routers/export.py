"""
Export router — download all usage data as CSV.
"""

from fastapi import APIRouter
from fastapi.responses import Response
from datetime import datetime

from database import export_all_csv

router = APIRouter()


@router.get("/export")
async def export_csv():
    csv = export_all_csv()
    filename = f"exo-usage-{datetime.now().strftime('%Y%m%d')}.csv"
    return Response(
        content=csv,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
