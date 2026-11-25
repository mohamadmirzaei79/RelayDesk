"""Canonical incident ledger. Django manages SQL connections and transactions."""
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from django.conf import settings
import django

ROOT = Path(__file__).parent
STATES = ["Investigating", "Mitigating", "Monitoring", "Resolved"]


def database():
    if os.getenv("PGHOST"):
        return {"ENGINE": "django.db.backends.postgresql", "HOST": os.environ["PGHOST"],
                "NAME": os.environ["PGDATABASE"], "USER": os.environ["PGUSER"],
                "PASSWORD": os.environ["PGPASSWORD"], "PORT": os.getenv("PGPORT", "5432")}
    return {"ENGINE": "django.db.backends.sqlite3", "NAME": os.getenv("LEDGER_PATH", str(ROOT / "ledger.sqlite3")),
            "OPTIONS": {"timeout": 20, "transaction_mode": "IMMEDIATE"}}


settings.configure(DATABASES={"default": database()}, INSTALLED_APPS=[], USE_TZ=True,
                   SECRET_KEY="relaydesk-orm-only")
django.setup()
from django.db import connection, models, transaction


class Incident(models.Model):
    key = models.CharField(primary_key=True, max_length=32)
    version = models.PositiveIntegerField()
    document = models.JSONField()

    class Meta:
        app_label = "relaydesk"


def initialize():
    # Run once before starting application replicas.
    if Incident._meta.db_table not in connection.introspection.table_names():
        with connection.schema_editor() as editor:
            editor.create_model(Incident)
    for record in json.loads((ROOT / "fixtures.json").read_text())["incidents"]:
        Incident.objects.get_or_create(key=record["id"], defaults={"version": 1, "document": record})


def inventory():
    return list(Incident.objects.order_by("-key").values_list("document", flat=True))


class Conflict(Exception):
    pass


def apply(key, version, next_state, note):
    with transaction.atomic():
        row = Incident.objects.get(pk=key)
        if row.version != version:
            raise Conflict("This incident changed. Refresh and try again.")
        item = row.document
        idx = STATES.index(item["state"])
        if next_state and next_state not in STATES[idx+1:idx+2]:
            raise ValueError("Move forward one stage at a time.")
        if not next_state and not note:
            raise ValueError("Write a note or choose the next stage.")
        if next_state:
            item["state"] = next_state
        item["version"] = version + 1
        item["events"].append({"kind": "Moved to " + next_state if next_state else "Operator note",
                              "detail": note, "time": datetime.now(timezone.utc).isoformat()})
        if not Incident.objects.filter(pk=key, version=version).update(version=version+1, document=item):
            raise Conflict("This incident changed. Refresh and try again.")
        return item


if __name__ == "__main__":
    initialize()
