# Quality Inspector Agent: Remaining Alignment Notes

This note summarizes what is still left from your side if you want the project to match the `current-application-design` PDF more closely, and what configuration values still need to be provided.

## Current status

The project now covers a large part of the workflow described in the PDF:

- React frontend
- Node.js backend
- AWS Bedrock-based inspection path
- 5-agent inspection workflow
- LangGraph orchestration
- Postgres persistence
- inspection history
- Bedrock debug/probe endpoints
- Bedrock interaction records
- enterprise integration tracking records
- enterprise integration connector framework

## Important reality

The project does **not** exactly match the PDF yet, because some of the remaining gaps are not only configuration gaps. A few are **architecture differences**.

## Remaining mismatches vs the PDF

### 1. Backend stack mismatch

The PDF describes a Python/FastAPI/LangGraph/Pydantic implementation baseline.

Current project:

- Node.js
- Express
- Zod
- LangGraph JS

This is the biggest remaining mismatch.

### 2. Enterprise integrations are framework-ready, but not fully live

The code now supports connector configuration and DB tracking for:

- MES
- ERP
- ServiceNow
- Supplier Portal

But real live integration still depends on endpoint/auth/payload details.

### 3. Security / enterprise auth is not implemented

The PDF expects stronger enterprise controls such as:

- authentication
- authorization / RBAC
- enterprise identity integration
- production-grade secret handling
- TLS / hardened deployment controls

These are still not implemented in the current local project.

### 4. Cloud / deployment architecture is not implemented

The local project is not the same as a full enterprise cloud deployment model.

Still missing if exact match is required:

- production deployment architecture
- enterprise observability / monitoring
- platform infrastructure controls

### 5. Full image / storage / CV pipeline is not implemented

Current project supports:

- uploaded image
- image URL
- Bedrock multimodal input

Still not fully matched to broader enterprise design ideas such as:

- richer preprocessing / CV pipeline
- storage-oriented image handling
- production image retention pipeline

## What is already addressed enough for demo

These areas are now reasonably covered:

- LangGraph orchestration
- broader API surface
- Bedrock debug/probe support
- Postgres persistence structure
- Bedrock interaction record storage
- enterprise integration submission record storage

## Configuration still required from your side

Update these values in:

- `backend/src/config/.env`

### A. AWS Bedrock configuration

You still need to provide real values for:

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_SESSION_TOKEN`
- `AWS_REGION`
- `BEDROCK_MODEL_ID`

Keep:

- `BEDROCK_ENABLED=true`

### B. Postgres configuration

You must confirm these are correct for your local machine:

- `DATABASE_ENABLED=true`
- `DATABASE_URL=postgresql://...`
- `DATABASE_SSL=false`
- `DATABASE_AUTO_MIGRATE=true`

Also make sure:

- PostgreSQL server is running
- database `quality_inspector` exists

### C. Enterprise integration configuration

These are already scaffolded in `.env`, but still need real values if you want live integrations:

- `ENTERPRISE_INTEGRATIONS_ENABLED`
- `MES_*`
- `ERP_*`
- `SERVICENOW_*`
- `SUPPLIER_PORTAL_*`

For each system, you will need:

- base URL
- endpoint path
- HTTP method
- auth type
- auth credentials
- final request payload contract

## Details still needed tomorrow for live enterprise integrations

For each of:

- MES
- ERP
- ServiceNow
- Supplier Portal

Please gather:

1. Base URL
2. Endpoint path
3. Method (`POST`, `PUT`, etc.)
4. Auth type
5. API key / bearer token / username-password / OAuth details
6. Example request payload
7. Example response payload
8. Trigger rule

Example trigger rule:

- only on `REJECT`
- on `REWORK` and `REJECT`
- only on `CRITICAL`
- always

## If you want the project to exactly match the PDF

These are the major remaining engineering tasks:

1. Rebuild backend from Node/Express to Python/FastAPI/Pydantic
2. Recreate API/runtime structure around that stack
3. Add real enterprise auth and RBAC
4. Add real enterprise integrations using final contracts
5. Add stronger platform/deployment architecture
6. Add richer storage / image pipeline if required by that design baseline

## Practical recommendation

For demo readiness, you do **not** need to complete every mismatch above.

Minimum remaining items from your side:

1. Put correct AWS Bedrock values into `.env`
2. Confirm Postgres connection works
3. Confirm Bedrock model ID works
4. Test one successful Bedrock inspection
5. Test persisted history after backend restart
6. If possible tomorrow, fill enterprise endpoint/auth details

## Suggested demo-safe statement

You can say:

> The current implementation aligns strongly with the workflow, agent model, Bedrock reasoning, and persistence architecture from the design document, while a few enterprise-specific areas such as stack parity, live external integrations, and production-grade security/platform controls remain as the next implementation phase.
