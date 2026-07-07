# Agentic AI Powered Manufacturing Component Quality Inspector

This project contains a React frontend and a Node.js backend for an agentic manufacturing quality inspection workflow.

- `frontend`: React app for submitting component inspection requests and reviewing agent outputs.
- `backend`: Node.js API that orchestrates the five-agent inspection loop and optionally calls AWS Bedrock.

The inspection form supports both direct image upload and image URL. If both are supplied, the backend sends the uploaded image to AWS Bedrock first and uses the URL as the fallback source.

AWS Bedrock responses are validated against the expected inspection JSON schema before they are returned to the frontend. If the model output is malformed or missing required quality fields, the backend handles it through the existing fallback path.

## Setup

1. Install dependencies:

```bash
npm run install:all
```

2. Configure backend environment:

```bash
copy backend\src\config\.env backend\src\config\.env.local-backup
```

Update your local values in `backend/src/config/.env`:
- AWS Bedrock settings
- Postgres connection settings
- optional enterprise integration settings

3. Start backend:

```bash
npm run dev:backend
```

4. Start frontend:

```bash
npm run dev:frontend
```

The frontend expects the backend at `http://localhost:4000` unless `VITE_API_BASE_URL` is changed.

## AWS Bedrock

Set `BEDROCK_ENABLED=true` in `backend/src/config/.env` to call AWS Bedrock. If Bedrock is disabled or unavailable, the backend uses a deterministic local inspection fallback so the application remains usable for demos and development.

## Postgres

Set `DATABASE_ENABLED=true` and `DATABASE_URL=postgresql://...` in `backend/src/config/.env` to persist inspection history, Bedrock interaction records, and enterprise integration submission records.
