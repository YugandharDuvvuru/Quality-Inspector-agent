# Database Storage Flow

This document explains how inspection data moves from the backend workflow into Postgres, what code performs the storage, and what each table receives.

## 1. Entry point for persistence

Persistence starts in:

- [backend/src/services/qualityOrchestrator.js](C:/Users/2440915/OneDrive%20-%20Cognizant/Documents/Quality%20Inspector%20agent/backend/src/services/qualityOrchestrator.js)

The main function is `runInspection(input)`.

High-level sequence:

1. backend receives validated inspection input
2. workflow produces the final inspection result
3. enterprise integration results are added
4. backend checks whether Postgres is ready
5. if ready, backend calls `saveInspectionToDatabase(...)`

Relevant flow:

- workflow result is created by `runQualityInspectionWorkflow(...)`
- final object is built into `storedResult`
- `saveInspectionToDatabase({ input, result: storedResult, workflowMetadata })` is called

If Postgres is not ready, the inspection still returns to the frontend, but nothing is stored.

## 2. Database readiness

Database readiness is handled in:

- [backend/src/db/connection.js](C:/Users/2440915/OneDrive%20-%20Cognizant/Documents/Quality%20Inspector%20agent/backend/src/db/connection.js)

Important functions:

- `initializeDatabase()`  
  Connects to Postgres and optionally runs migrations.

- `isDatabaseReady()`  
  Returns whether persistence is currently available.

- `withTransaction(callback)`  
  Runs the full storage logic inside one SQL transaction.

This means the project tries to store all inspection-related rows atomically.

## 3. Main persistence function

The actual storage logic lives in:

- [backend/src/repositories/inspectionRepository.js](C:/Users/2440915/OneDrive%20-%20Cognizant/Documents/Quality%20Inspector%20agent/backend/src/repositories/inspectionRepository.js)

The main function is:

- `saveInspectionToDatabase({ input, result, workflowMetadata })`

This function runs inside a transaction and calls a sequence of smaller insert helpers.

## 4. Exact storage sequence

When one inspection is saved, the repository performs these steps in order:

1. `upsertComponent(...)`
2. `insertInspectionRequest(...)`
3. `insertInspectionResult(...)`
4. `insertDefects(...)`
5. `insertRecommendedActions(...)`
6. `insertNotifications(...)`
7. `insertNcrReport(...)`
8. `insertAuditLog(...)`
9. `insertBedrockInteractionRecords(...)`
10. `insertEnterpriseIntegrationSubmissions(...)`

This is the full persistence chain for one inspection run.

## 5. What is being stored at each step

### Step 1: Component master

Function:

- `upsertComponent(client, input)`

Table:

- `components`

What it stores:

- `component_code`
- `material`
- `supplier`
- `updated_at`

Behavior:

- if this `component_id` does not exist, insert a new component row
- if it already exists, update the same row

Purpose:

- maintain one master row per component code

## Step 2: Inspection request

Function:

- `insertInspectionRequest(client, componentId, input)`

Table:

- `inspection_requests`

What it stores:

- `component_id`
- `inspection_station`
- `line_id`
- `image_url`
- `image_file_name`
- `image_media_type`
- `inspection_timestamp`
- `metadata`

Purpose:

- record the exact inspection input that was submitted

This is the request-side record of the inspection.

## Step 3: Final inspection result

Function:

- `insertInspectionResult(client, inspectionRequestId, result)`

Table:

- `inspection_results`

What it stores:

- `inspection_request_id`
- `source`
- `overall_confidence`
- `severity`
- `verdict`
- `line_action`
- `batch_action`
- `human_override_required`
- `justification`
- `fallback_reason`
- `raw_response`
- `created_at`

Purpose:

- store the final consolidated inspection report

Important detail:

- `raw_response` contains the complete final JSON result

So the project stores the full report first, then breaks parts of it into detail tables.

## Step 4: Defect details

Function:

- `insertDefects(client, inspectionResultId, result)`

Table:

- `detected_defects`

What it reads from result:

- `result.inspection_summary.defects_detected`

What it stores per defect:

- `inspection_result_id`
- `defect_type`
- `location`
- `bounding_box`
- `confidence`
- `severity`

Purpose:

- normalize each detected defect into its own row

## Step 5: Recommended actions

Function:

- `insertRecommendedActions(client, inspectionResultId, result)`

Table:

- `recommended_actions`

What it reads from result:

- `result.root_cause_analysis.recommended_actions`

What it stores:

- `inspection_result_id`
- `action`
- `owner`
- `timeline`

Purpose:

- store corrective and follow-up action items

## Step 6: Notifications

Function:

- `insertNotifications(client, inspectionResultId, input, result)`

Table:

- `notifications`

What it reads from result:

- `result.notifications.notifications_sent`

What it stores:

- `inspection_result_id`
- `notification_type`
- `recipient`
- `message`
- `delivery_status`

Purpose:

- record who should be informed about this inspection outcome

## Step 7: NCR report

Function:

- `insertNcrReport(client, inspectionResultId, result)`

Table:

- `ncr_reports`

What it reads from result:

- `result.notifications.ncr_report`
- `result.notifications.copq_estimate`

What it stores:

- `inspection_result_id`
- `ncr_number`
- `report_text`
- `copq_estimate`
- `status`

Purpose:

- store non-conformance reporting output

Behavior:

- if NCR is not required, row is still stored with a status like `NOT_REQUIRED`

## Step 8: Audit log

Function:

- `insertAuditLog(client, inspectionResultId, input, result)`

Table:

- `inspection_audit_log`

What it stores:

- `inspection_result_id`
- `event_type`
- `event_details`

The `event_details` JSON includes:

- `component_id`
- `line_id`
- `inspection_station`
- `source`
- `verdict`
- `confidence_score`
- `audit_log`
- `agentic_loop`

Purpose:

- create an audit-ready record of the completed inspection event

## Step 9: Bedrock interaction records

Function:

- `insertBedrockInteractionRecords(client, inspectionResultId, interactions)`

Table:

- `bedrock_interaction_records`

What it reads from:

- `workflowMetadata.bedrockInteractions`

What it stores:

- `inspection_result_id`
- `stage_name`
- `model_id`
- `region`
- `prompt_text`
- `response_text`
- `success`
- `skipped`
- `error_summary`

Purpose:

- store the LLM trace for each workflow stage

Current behavior:

- one inspection can now create multiple Bedrock interaction rows
- one row per stage such as:
  - `vision_inspector`
  - `severity_classifier`
  - `root_cause_analyst`
  - `decision_action`
  - `escalation_notify`

## Step 10: Enterprise integration submissions

Function:

- `insertEnterpriseIntegrationSubmissions(client, inspectionResultId, submissions)`

Table:

- `enterprise_integration_submissions`

What it reads from:

- `workflowMetadata.enterpriseIntegrations`

What it stores:

- `inspection_result_id`
- `system_name`
- `submission_status`
- `skipped_flag`
- `external_reference`
- `request_payload`
- `response_payload`
- `error_detail`

Purpose:

- store outbound integration trace for MES, ERP, ServiceNow, and Supplier Portal style systems

## 6. Why both raw JSON and normalized tables are stored

The project uses both strategies together:

### A. Full raw response

Stored in:

- `inspection_results.raw_response`

Reason:

- preserves the complete final inspection report exactly as returned by the workflow
- useful for traceability, debugging, and replay analysis

### B. Normalized detail rows

Stored in:

- `detected_defects`
- `recommended_actions`
- `notifications`
- `ncr_reports`
- `inspection_audit_log`
- `bedrock_interaction_records`
- `enterprise_integration_submissions`

Reason:

- makes querying and reporting easier
- supports dashboards, audit reports, and analytics

## 7. Relationship summary

Main relationship chain:

1. one `components` row
2. many `inspection_requests` rows for that component
3. one `inspection_results` row per inspection request
4. many child detail rows linked to `inspection_results`

In practical terms:

- `components` = what part is being tracked
- `inspection_requests` = what input was submitted
- `inspection_results` = what final outcome was produced
- child tables = evidence, actions, notifications, audit, LLM trace, integrations

## 8. What happens if Bedrock fails

If Bedrock fails during one or more workflow stages:

- the workflow can fall back to local agent logic
- the final result still gets stored in `inspection_results`
- fallback information is stored in:
  - `inspection_results.source`
  - `inspection_results.fallback_reason`
- Bedrock failure details are stored in:
  - `bedrock_interaction_records.error_summary`

So failed LLM calls do not prevent the inspection from being persisted, provided the database is ready.

## 9. What happens if Postgres is not ready

If Postgres is unavailable:

- the workflow still returns the inspection result to the frontend
- `saveInspectionToDatabase(...)` is not executed successfully
- no inspection rows are stored

That check happens in:

- [backend/src/services/qualityOrchestrator.js](C:/Users/2440915/OneDrive%20-%20Cognizant/Documents/Quality%20Inspector%20agent/backend/src/services/qualityOrchestrator.js)

## 10. Short summary

The backend stores data through `saveInspectionToDatabase(...)` in the repository layer. It first stores the component master, then the inspection request, then the final inspection result, and then distributes detailed parts of the response into specialized child tables such as defects, actions, notifications, NCR, audit logs, Bedrock interactions, and enterprise integration submissions.
