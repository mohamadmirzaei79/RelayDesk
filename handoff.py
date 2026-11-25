"""A deterministic Chainlit shift assistant over the live incident API."""
import os
import chainlit as cl
import httpx


@cl.on_chat_start
async def welcome():
    await cl.Message(content="Type **handoff** for the open queue, or an incident ID for its latest update.").send()


@cl.on_message
async def respond(message: cl.Message):
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get(os.environ["API_URL"] + "/api/incidents",
                                        headers={"Authorization": "Bearer " + os.environ["RELAY_TOKEN"]})
            response.raise_for_status()
            records = response.json()["incidents"]
    except httpx.HTTPError:
        await cl.Message(content="The incident API is unavailable. Try again shortly.").send()
        return
    query = message.content.strip().lower()
    if query == "handoff":
        lines = [f"- **{r['id']}** · {r['severity']} · {r['state']} · {r['owner']} — {r['title']}"
                 for r in records if r["state"] != "Resolved"]
        result = "\n".join(lines) or "The queue is clear."
    else:
        record = next((r for r in records if r["id"].lower() == query), None)
        if record:
            last = record["events"][-1]
            result = f"**{record['title']}** · {record['state']}\n\n{last['kind']} · {last['detail']}"
        else:
            result = "Use **handoff** or an incident ID such as **INC-1042**."
    await cl.Message(content=result).send()
