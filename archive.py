"""Snapshot incident timelines into MongoDB. A versioned key makes retries safe."""
import os
from pymongo import MongoClient, ReplaceOne
from ledger import inventory


def sync():
    with MongoClient(os.environ["MONGO_URL"], serverSelectionTimeoutMS=6000) as client:
        records = inventory()
        operations = [ReplaceOne({"_id": f"{r['id']}:{r['version']}"}, r.copy(), upsert=True)
                      for r in records]
        if operations:
            client.relaydesk.snapshots.bulk_write(operations, ordered=False)
        return len(records)


if __name__ == "__main__":
    print(f"Archived {sync()} incident snapshots")
