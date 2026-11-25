import os
import tempfile
import unittest
from pathlib import Path

temp = tempfile.TemporaryDirectory()
os.environ.pop("PGHOST", None)
os.environ.update(LEDGER_PATH=str(Path(temp.name) / "test.sqlite3"), RELAY_TOKEN="test-only")
from fastapi.testclient import TestClient
from api import app
from ledger import Incident, initialize
from django.db import connections


def tearDownModule():
    connections.close_all()
    temp.cleanup()


class DeskTests(unittest.TestCase):
    def setUp(self):
        initialize()
        self.client = TestClient(app)
        self.auth = {"Authorization": "Bearer test-only"}
        self.path = "/api/incidents/INC-1042"

    def tearDown(self):
        Incident.objects.all().delete()
        self.client.close()

    def test_access(self):
        self.assertEqual(self.client.get("/api/incidents").status_code, 401)
        self.assertEqual(len(self.client.get("/api/incidents", headers=self.auth).json()["incidents"]), 5)

    def test_transition_and_stale_write(self):
        body = {"version": 1, "state": "Mitigating", "note": "Traffic shifted"}
        self.assertEqual(self.client.post(self.path, json=body, headers=self.auth).status_code, 200)
        self.assertEqual(self.client.post(self.path, json=body, headers=self.auth).status_code, 409)
        item = Incident.objects.get(pk="INC-1042").document
        self.assertEqual((item["version"], item["state"], len(item["events"])), (2, "Mitigating", 2))

    def test_transition_validation(self):
        for body in ({"version": 1}, {"version": 1, "state": "Resolved"}):
            self.assertEqual(self.client.post(self.path, json=body, headers=self.auth).status_code, 422)

    def test_note_without_state_change(self):
        item = self.client.post(self.path, json={"version":1, "note":"Investigating cache"},
                                headers=self.auth).json()
        self.assertEqual(item["state"], "Investigating")
        self.assertEqual(item["events"][-1]["detail"], "Investigating cache")

    def test_observability(self):
        self.assertEqual(self.client.get("/ready").json(), {"ready": True})
        self.assertIn("relaydesk_incident_changes", self.client.get("/metrics").text)
