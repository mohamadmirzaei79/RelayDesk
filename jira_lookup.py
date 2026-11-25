"""Read a linked Jira Cloud issue during triage."""
import argparse
import os
import re

import httpx

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("issue")
    key = parser.parse_args().issue
    if not re.fullmatch(r"[A-Z][A-Z0-9_]*-[1-9][0-9]*", key):
        parser.error("Expected an issue key such as OPS-142")
    base = os.environ["JIRA_URL"].rstrip("/")
    if not base.startswith("https://"):
        parser.error("JIRA_URL must use HTTPS")
    response = httpx.get(f"{base}/rest/api/3/issue/{key}", params={"fields":"status,summary"},
                         auth=(os.environ["JIRA_EMAIL"], os.environ["JIRA_API_TOKEN"]), timeout=8)
    response.raise_for_status()
    fields = response.json()["fields"]
    print(key, fields["status"]["name"], fields["summary"], sep=" · ")
