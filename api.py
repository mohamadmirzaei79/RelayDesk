import hmac
import os

from fastapi import Depends, FastAPI, Header, HTTPException, Response
from fastapi.responses import JSONResponse
from django.db import close_old_connections
from prometheus_client import CONTENT_TYPE_LATEST, Counter, generate_latest
from pydantic import BaseModel, Field

from ledger import Conflict, Incident, apply, inventory

app = FastAPI(title="RelayDesk incident API", version="1.0.0")
changes = Counter("relaydesk_incident_changes", "Committed incident changes", ["kind"])


def sql_session():
    close_old_connections()
    try:
        yield
    finally:
        close_old_connections()


def authorize(authorization: str = Header(default="")):
    token = os.getenv("RELAY_TOKEN", "")
    if not token or not hmac.compare_digest(authorization.encode(), ("Bearer " + token).encode()):
        raise HTTPException(401, "Operator token required")


class Change(BaseModel):
    version: int = Field(ge=1)
    state: str | None = None
    note: str = Field(default="", max_length=600)


@app.get("/ready")
def ready():
    try:
        Incident.objects.exists()
        return {"ready": True}
    except Exception:
        return JSONResponse({"ready": False}, status_code=503)
    finally:
        close_old_connections()


@app.get("/metrics")
def metrics():
    return Response(generate_latest(), headers={"Content-Type": CONTENT_TYPE_LATEST})


@app.get("/api/incidents", dependencies=[Depends(authorize), Depends(sql_session)])
def incidents():
    return {"incidents": inventory()}


@app.post("/api/incidents/{key}", dependencies=[Depends(authorize), Depends(sql_session)])
def update(key: str, body: Change):
    try:
        result = apply(key, body.version, body.state, body.note.strip())
    except Incident.DoesNotExist:
        raise HTTPException(404, "Unknown incident")
    except Conflict as error:
        raise HTTPException(409, str(error))
    except ValueError as error:
        raise HTTPException(422, str(error))
    changes.labels("transition" if body.state else "note").inc()
    return result
