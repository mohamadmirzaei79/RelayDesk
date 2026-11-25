FROM python:3.12-slim AS backend
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && useradd --uid 10001 --create-home relay && chown relay /app
COPY api.py ledger.py archive.py handoff.py fixtures.json ./
USER relay
CMD ["uvicorn","api:app","--host","0.0.0.0","--port","8000"]

FROM node:22-alpine AS gateway
WORKDIR /app
COPY gateway.mjs index.html desk.css desk.js fixtures.json ./
USER node
CMD ["node","gateway.mjs"]
