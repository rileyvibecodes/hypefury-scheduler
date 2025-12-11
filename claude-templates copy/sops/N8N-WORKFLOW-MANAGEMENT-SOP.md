# n8n Workflow Management SOP for Claude Code

This SOP enables Claude Code to create, update, test, debug, and manage n8n workflows autonomously.

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [n8n Workflow JSON Structure](#n8n-workflow-json-structure)
4. [Creating Workflows](#creating-workflows)
5. [Updating Existing Workflows](#updating-existing-workflows)
6. [Testing Workflows](#testing-workflows)
7. [Reading Logs & Debugging](#reading-logs--debugging)
8. [Common Node Types Reference](#common-node-types-reference)
9. [Best Practices](#best-practices)
10. [Troubleshooting](#troubleshooting)

---

## Overview

Claude Code can autonomously manage n8n workflows by:
- **Creating** workflow JSON files from scratch
- **Importing** workflows via n8n's API or UI
- **Testing** workflows via webhook triggers or manual execution
- **Reading logs** via n8n's execution API
- **Debugging** and fixing errors automatically

### Integration Methods

| Method | Use Case | Complexity |
|--------|----------|------------|
| JSON File Creation | Create workflows for manual import | Low |
| n8n REST API | Full automation (CRUD, execute, logs) | Medium |
| Webhook Triggers | Test workflows programmatically | Low |

---

## Prerequisites

### n8n Instance Access

```bash
# Self-hosted n8n (Docker)
N8N_HOST=http://your-vps-ip:5678

# n8n Cloud
N8N_HOST=https://your-instance.app.n8n.cloud
```

### API Authentication

```bash
# For n8n REST API access, you need an API key
# Generate at: Settings → API → Create API Key
N8N_API_KEY=your-api-key-here
```

### Required Environment Variables

```bash
# Add to .env or project configuration
N8N_HOST=http://srv1176124.hstgr.cloud:5678
N8N_API_KEY=your-n8n-api-key
```

---

## n8n Workflow JSON Structure

### Minimal Workflow Template

```json
{
  "name": "Workflow Name",
  "nodes": [],
  "connections": {},
  "settings": {
    "executionOrder": "v1"
  },
  "pinData": {},
  "staticData": null,
  "tags": [],
  "triggerCount": 0
}
```

### Node Structure

Every node follows this pattern:

```json
{
  "parameters": {
    // Node-specific configuration
  },
  "id": "unique-node-id",
  "name": "Human Readable Name",
  "type": "n8n-nodes-base.nodeType",
  "typeVersion": 1,
  "position": [x, y],
  "credentials": {
    "credentialType": {
      "id": "credential-id",
      "name": "Credential Name"
    }
  }
}
```

### Connection Structure

Connections define data flow between nodes:

```json
{
  "connections": {
    "Source Node Name": {
      "main": [
        [
          {
            "node": "Target Node Name",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  }
}
```

### Multi-Output Nodes (IF, Switch)

For nodes with multiple outputs:

```json
{
  "IF Node": {
    "main": [
      [{ "node": "True Branch", "type": "main", "index": 0 }],
      [{ "node": "False Branch", "type": "main", "index": 0 }]
    ]
  }
}
```

---

## Creating Workflows

### Step 1: Define the Workflow Requirements

Before creating, document:
- **Trigger**: What starts the workflow? (Webhook, Schedule, App trigger)
- **Data Flow**: What transformations are needed?
- **Outputs**: What are the end actions? (API calls, emails, database writes)
- **Error Handling**: How should failures be managed?

### Step 2: Create the Workflow JSON

```javascript
// Example: Webhook → Process Data → HTTP Request
const workflow = {
  "name": "API Data Processor",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "process-data",
        "responseMode": "responseNode"
      },
      "id": "webhook-trigger",
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [250, 300],
      "webhookId": "unique-webhook-id"
    },
    {
      "parameters": {
        "jsCode": "// Transform the incoming data\nconst input = $input.first().json;\nreturn [{ json: { processed: true, data: input } }];"
      },
      "id": "process-data",
      "name": "Process Data",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [450, 300]
    },
    {
      "parameters": {
        "respondWith": "json",
        "responseBody": "={{ $json }}"
      },
      "id": "respond",
      "name": "Respond to Webhook",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1,
      "position": [650, 300]
    }
  ],
  "connections": {
    "Webhook": {
      "main": [[{ "node": "Process Data", "type": "main", "index": 0 }]]
    },
    "Process Data": {
      "main": [[{ "node": "Respond to Webhook", "type": "main", "index": 0 }]]
    }
  },
  "settings": { "executionOrder": "v1" }
};
```

### Step 3: Save the Workflow File

```bash
# Save to workflows/ directory
cat > workflows/my-new-workflow.json << 'EOF'
{
  "name": "My New Workflow",
  ...
}
EOF
```

### Step 4: Import via n8n API (Optional)

```bash
# Import workflow via API
curl -X POST "${N8N_HOST}/api/v1/workflows" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
  -H "Content-Type: application/json" \
  -d @workflows/my-new-workflow.json
```

---

## Updating Existing Workflows

### Reading Current Workflow State

```bash
# Get workflow by ID
curl -X GET "${N8N_HOST}/api/v1/workflows/{workflow_id}" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}" | jq '.'

# List all workflows
curl -X GET "${N8N_HOST}/api/v1/workflows" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}" | jq '.data[] | {id, name, active}'
```

### Modifying Workflow JSON

1. **Read the current workflow file**
2. **Parse and modify the JSON structure**
3. **Validate the changes**
4. **Write back or update via API**

```bash
# Update workflow via API
curl -X PATCH "${N8N_HOST}/api/v1/workflows/{workflow_id}" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
  -H "Content-Type: application/json" \
  -d @workflows/updated-workflow.json
```

### Adding a New Node

```javascript
// 1. Add to nodes array
workflow.nodes.push({
  "parameters": { /* config */ },
  "id": "new-node-id",
  "name": "New Node",
  "type": "n8n-nodes-base.nodeType",
  "typeVersion": 1,
  "position": [x, y]
});

// 2. Update connections
workflow.connections["Previous Node"].main[0].push({
  "node": "New Node",
  "type": "main",
  "index": 0
});

// 3. Add outgoing connection from new node
workflow.connections["New Node"] = {
  "main": [[{ "node": "Next Node", "type": "main", "index": 0 }]]
};
```

### Removing a Node

```javascript
// 1. Remove from nodes array
workflow.nodes = workflow.nodes.filter(n => n.name !== "Node To Remove");

// 2. Remove from connections (as source)
delete workflow.connections["Node To Remove"];

// 3. Remove from connections (as target)
for (const source in workflow.connections) {
  workflow.connections[source].main = workflow.connections[source].main.map(
    outputs => outputs.filter(conn => conn.node !== "Node To Remove")
  );
}
```

---

## Testing Workflows

### Method 1: Webhook Trigger (Recommended)

```bash
# Get the webhook URL from n8n (when workflow is active)
WEBHOOK_URL="${N8N_HOST}/webhook/your-webhook-path"

# Test with sample payload
curl -X POST "${WEBHOOK_URL}" \
  -H "Content-Type: application/json" \
  -d '{"test": true, "data": "sample"}'
```

### Method 2: Manual Execution via API

```bash
# Execute workflow manually
curl -X POST "${N8N_HOST}/api/v1/workflows/{workflow_id}/run" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"data": {"key": "value"}}'
```

### Method 3: Activate/Deactivate Workflow

```bash
# Activate workflow
curl -X PATCH "${N8N_HOST}/api/v1/workflows/{workflow_id}/activate" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}"

# Deactivate workflow
curl -X PATCH "${N8N_HOST}/api/v1/workflows/{workflow_id}/deactivate" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}"
```

### Validation Checklist

Before deploying a workflow:

- [ ] All node IDs are unique
- [ ] All node names referenced in connections exist
- [ ] Credential IDs match your n8n instance
- [ ] Position coordinates don't overlap
- [ ] Required parameters are filled for each node
- [ ] Error handling is configured for critical nodes

---

## Reading Logs & Debugging

### Get Execution History

```bash
# List recent executions
curl -X GET "${N8N_HOST}/api/v1/executions?limit=10" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}" | jq '.'

# Filter by workflow
curl -X GET "${N8N_HOST}/api/v1/executions?workflowId={id}&limit=10" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}"

# Filter by status
curl -X GET "${N8N_HOST}/api/v1/executions?status=error&limit=10" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}"
```

### Get Execution Details

```bash
# Get specific execution with full data
curl -X GET "${N8N_HOST}/api/v1/executions/{execution_id}" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}" | jq '.'
```

### Parsing Error Information

```javascript
// Execution response structure
{
  "id": "execution-id",
  "finished": true,
  "mode": "webhook",
  "startedAt": "2025-12-06T10:00:00.000Z",
  "stoppedAt": "2025-12-06T10:00:05.000Z",
  "status": "error",  // "success", "error", "waiting"
  "data": {
    "resultData": {
      "error": {
        "message": "Error description here",
        "node": "Node that failed",
        "timestamp": 1701860405000
      },
      "runData": {
        // Output from each node
      }
    }
  }
}
```

### Common Error Patterns & Fixes

| Error Pattern | Cause | Fix |
|---------------|-------|-----|
| `Cannot read property 'X' of undefined` | Missing input data | Add null checks in Code node |
| `401 Unauthorized` | Invalid credentials | Update credential in n8n |
| `ECONNREFUSED` | Service unreachable | Check target URL/service |
| `Timeout` | Slow external API | Increase timeout in node options |
| `Invalid JSON` | Malformed data | Validate/sanitize input |

### Automated Debug Cycle

```bash
#!/bin/bash
# debug-workflow.sh - Automated test and fix cycle

WORKFLOW_ID=$1
N8N_HOST="${N8N_HOST}"
N8N_API_KEY="${N8N_API_KEY}"

# 1. Execute workflow
echo "Executing workflow..."
EXEC_RESPONSE=$(curl -s -X POST "${N8N_HOST}/api/v1/workflows/${WORKFLOW_ID}/run" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}")

EXEC_ID=$(echo $EXEC_RESPONSE | jq -r '.id')
echo "Execution ID: $EXEC_ID"

# 2. Wait for completion
sleep 5

# 3. Get execution result
RESULT=$(curl -s -X GET "${N8N_HOST}/api/v1/executions/${EXEC_ID}" \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}")

STATUS=$(echo $RESULT | jq -r '.status')
echo "Status: $STATUS"

if [ "$STATUS" = "error" ]; then
  echo "Error details:"
  echo $RESULT | jq '.data.resultData.error'
fi
```

---

## Common Node Types Reference

### Triggers

| Node Type | Use Case | Key Parameters |
|-----------|----------|----------------|
| `webhook` | HTTP requests | `httpMethod`, `path`, `responseMode` |
| `schedule` | Cron/interval | `rule.interval`, `cronExpression` |
| `typeformTrigger` | Typeform submissions | `formId`, `event` |
| `emailTrigger` | Incoming emails | IMAP settings |

### Data Processing

| Node Type | Use Case | Key Parameters |
|-----------|----------|----------------|
| `code` | Custom JavaScript | `jsCode` |
| `set` | Set/modify fields | `assignments` |
| `if` | Conditional routing | `conditions` |
| `switch` | Multi-branch routing | `rules` |
| `splitInBatches` | Loop/batch processing | `batchSize` |
| `merge` | Combine data streams | `mode` |

### External Services

| Node Type | Use Case | Key Parameters |
|-----------|----------|----------------|
| `httpRequest` | API calls | `url`, `method`, `body` |
| `googleDrive` | Google Drive ops | `operation`, `fileId` |
| `notion` | Notion database | `resource`, `databaseId` |
| `slack` | Slack messages | `channel`, `text` |
| `gmail` | Send emails | `sendTo`, `subject`, `message` |

### Webhook Response Pattern

```json
{
  "parameters": {
    "httpMethod": "POST",
    "path": "my-endpoint",
    "responseMode": "responseNode"
  },
  "type": "n8n-nodes-base.webhook"
}
// ... processing nodes ...
{
  "parameters": {
    "respondWith": "json",
    "responseBody": "={{ $json }}"
  },
  "type": "n8n-nodes-base.respondToWebhook"
}
```

### HTTP Request Pattern

```json
{
  "parameters": {
    "url": "https://api.example.com/endpoint",
    "authentication": "predefinedCredentialType",
    "nodeCredentialType": "httpHeaderAuth",
    "sendHeaders": true,
    "headerParameters": {
      "parameters": [
        { "name": "Content-Type", "value": "application/json" }
      ]
    },
    "sendBody": true,
    "specifyBody": "json",
    "jsonBody": "={{ JSON.stringify($json) }}",
    "options": {
      "timeout": 30000
    }
  },
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.2,
  "retryOnFail": true,
  "maxTries": 3
}
```

### Code Node Pattern

```json
{
  "parameters": {
    "jsCode": "// Access input data\nconst items = $input.all();\n\n// Process each item\nconst results = items.map(item => {\n  return {\n    json: {\n      ...item.json,\n      processed: true,\n      timestamp: new Date().toISOString()\n    }\n  };\n});\n\nreturn results;"
  },
  "type": "n8n-nodes-base.code",
  "typeVersion": 2
}
```

---

## Best Practices

### 1. Naming Conventions

```
Workflow: "[Client/Project] - [Action] - [Trigger Type]"
Example: "Offer Audit - Fetch Transcripts - Typeform Trigger"

Nodes: "[Action] [Target]"
Example: "Validate Form Input", "Save to Drive", "Send Notification"
```

### 2. Error Handling

Always add error handling for critical operations:

```json
{
  "parameters": { /* ... */ },
  "type": "n8n-nodes-base.httpRequest",
  "onError": "continueRegularOutput",
  "retryOnFail": true,
  "maxTries": 3,
  "waitBetweenTries": 5000
}
```

### 3. Logging with Sticky Notes

Add documentation to workflows:

```json
{
  "parameters": {
    "content": "## Workflow Overview\n\n**Trigger:** Typeform submission\n**Output:** Google Drive files\n\n### Steps\n1. Validate input\n2. Fetch transcripts\n3. Save to Drive",
    "height": 200,
    "width": 300
  },
  "type": "n8n-nodes-base.stickyNote",
  "position": [100, 100]
}
```

### 4. Modular Design

Break complex workflows into sub-workflows:

```json
{
  "parameters": {
    "workflowId": "sub-workflow-id",
    "workflowInputs": {
      "assignments": [
        { "name": "inputData", "value": "={{ $json }}" }
      ]
    }
  },
  "type": "n8n-nodes-base.executeWorkflow"
}
```

### 5. Credential Management

Never hardcode credentials in workflow JSON:

```json
// CORRECT - Reference credential by ID
"credentials": {
  "googleDriveOAuth2Api": {
    "id": "YOUR_CREDENTIAL_ID",
    "name": "Google Drive"
  }
}

// WRONG - Never do this
"parameters": {
  "apiKey": "sk-actual-api-key-here"  // NO!
}
```

---

## Troubleshooting

### Workflow Won't Activate

1. Check for missing credentials
2. Verify all required parameters are set
3. Look for circular connections
4. Ensure trigger node is properly configured

### Webhook Not Responding

1. Confirm workflow is active
2. Check webhook path is correct
3. Verify n8n is accessible externally
4. Check firewall/port settings

### Data Not Passing Between Nodes

1. Verify connection exists in `connections` object
2. Check node names match exactly (case-sensitive)
3. Ensure previous node outputs data
4. Use `$input.all()` or `$input.first()` correctly in Code nodes

### Expression Errors

```javascript
// Common expression patterns

// Access current item
{{ $json.fieldName }}

// Access from specific node
{{ $('Node Name').first().json.fieldName }}

// With fallback
{{ $json.field ?? 'default' }}

// Conditional
{{ $json.status === 'active' ? 'yes' : 'no' }}

// JSON stringify for body
{{ JSON.stringify($json) }}
```

---

## Quick Reference: Workflow Creation Checklist

```markdown
## New Workflow Checklist

### Planning
- [ ] Trigger type defined
- [ ] Data flow documented
- [ ] Required credentials identified
- [ ] Error handling strategy planned

### Implementation
- [ ] Unique node IDs assigned
- [ ] Positions set (no overlaps)
- [ ] All connections defined
- [ ] Credential placeholders added

### Testing
- [ ] Workflow saved to workflows/
- [ ] Imported to n8n successfully
- [ ] Test data prepared
- [ ] Webhook/trigger tested
- [ ] Error cases tested

### Deployment
- [ ] Workflow activated
- [ ] Monitoring configured
- [ ] Documentation updated
```

---

## Example: Complete Workflow Template

See `workflows/` directory for production examples:

- `n8n-1-main-onboarding-workflow.json` - Typeform → Google Drive
- `n8n-2-meeting-links-workflow.json` - Full transcript processing
- `n8n-transcript-only-workflow.json` - Minimal webhook workflow

---

*Last Updated: December 2025*
