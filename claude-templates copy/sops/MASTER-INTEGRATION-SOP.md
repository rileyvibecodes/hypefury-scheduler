# Master Integration SOP: Claude Code + GitHub + Hostinger + n8n

This SOP provides the complete workflow for using Claude Code to build, deploy, and automate applications across all three platforms.

---

## The Power Stack

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLAUDE CODE                               │
│  Creates apps, writes code, manages everything autonomously      │
└─────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
    ┌──────────┐        ┌──────────┐        ┌──────────┐
    │  GitHub  │        │ Hostinger│        │   n8n    │
    │   Git    │◄──────►│   VPS    │◄──────►│ Workflows│
    │  Repos   │        │  Docker  │        │  Webhooks│
    └──────────┘        └──────────┘        └──────────┘
         │                   │                   │
         │    Version        │   Hosting &       │  Automation
         │    Control        │   Deployment      │  & Integration
         │                   │                   │
         └───────────────────┴───────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  Production App  │
                    │  Fully Automated │
                    └──────────────────┘
```

---

## Complete Workflow: Idea → Production

### Phase 1: Development (Claude Code + Git)

```markdown
## Step 1: Create Application

Claude Code builds the application:
- Creates project structure
- Writes source code
- Creates Dockerfile and docker-compose.yml
- Generates documentation

## Step 2: Version Control

Initialize and push to GitHub:
```bash
git init
git add .
git commit -m "Initial commit"
gh repo create my-app --public
git push -u origin main
```
```

### Phase 2: Deployment (Hostinger MCP)

```markdown
## Step 3: Deploy to VPS

Use Hostinger MCP:

1. Get VPS ID:
   `VPS_getVirtualMachinesV1`

2. Deploy Docker project:
   `VPS_createNewProjectV1` with GitHub URL

3. Configure DNS:
   `DNS_updateDNSRecordsV1` to point domain to VPS

4. Verify deployment:
   `VPS_getProjectContainersV1`
   `VPS_getProjectLogsV1`
```

### Phase 3: Automation (n8n)

```markdown
## Step 4: Create n8n Workflow

Build workflow JSON:
- Webhook trigger for external events
- HTTP nodes for API calls
- Code nodes for data processing
- Output actions (Drive, Notion, email, etc.)

## Step 5: Connect to Deployed App

Configure n8n to call your deployed service:
- Webhook URL: `http://your-vps:3000/api/webhook`
- Authentication as needed
```

### Phase 4: Integration Loop

```markdown
## Step 6: Continuous Improvement

1. Update code locally
2. Commit and push to GitHub
3. Redeploy via Hostinger MCP
4. Update n8n workflow if needed
5. Test end-to-end
```

---

## Real-World Example: Transcript Analyzer

### The Complete Build

```markdown
## Project: Offer Audit Automation

### 1. Application Created (Claude Code)
- Node.js/Express server
- Fathom/tl;dv API integration
- Transcript processing logic
- Dockerfile for containerization

### 2. GitHub Repository
```bash
gh repo create offer-audit-automation --public
git push -u origin main
```

### 3. Hostinger VPS Deployment
```
VPS_createNewProjectV1:
  virtualMachineId: 12345
  project_name: "transcript-fetcher"
  content: "https://github.com/user/offer-audit-automation"
```

### 4. DNS Configuration
```
DNS_updateDNSRecordsV1:
  domain: "srv1176124.hstgr.cloud"
  zone: A record → VPS IP
```

### 5. n8n Workflow
```json
{
  "name": "Offer Audit - Fetch Transcripts",
  "nodes": [
    { "type": "typeformTrigger", "name": "Typeform Trigger" },
    { "type": "httpRequest", "url": "http://vps:3000/api/webhook" },
    { "type": "googleDrive", "operation": "upload" }
  ]
}
```

### Result
Typeform submission → n8n → VPS app → transcripts → Google Drive
All automated, no manual intervention required.
```

---

## MCP Configuration Template

### .mcp.json for Full Integration

```json
{
  "mcpServers": {
    "hostinger-api": {
      "command": "hostinger-api-mcp",
      "env": {
        "DEBUG": "false",
        "APITOKEN": "your-hostinger-api-token"
      }
    }
  }
}
```

### Required Environment Variables

```bash
# .env file
# Hostinger
HOSTINGER_API_TOKEN=your-token

# GitHub (usually via gh auth login)
GITHUB_TOKEN=your-github-token

# n8n
N8N_HOST=http://your-n8n-instance:5678
N8N_API_KEY=your-n8n-api-key

# Application-specific
FATHOM_API_KEY=your-fathom-key
ANTHROPIC_API_KEY=your-anthropic-key
```

---

## Common Patterns

### Pattern 1: Webhook Pipeline

```
External Service → n8n Webhook → VPS Application → Output
     (Typeform)                   (Processing)     (Google Drive)
```

**Implementation:**
1. Create webhook endpoint in your app
2. Deploy to VPS
3. Create n8n workflow with webhook trigger
4. Connect external service to n8n webhook
5. n8n calls your VPS app
6. App processes and returns data
7. n8n saves to output destination

### Pattern 2: Scheduled Processing

```
n8n Schedule → VPS Application → Database/Storage
   (Cron)        (Batch Job)       (Results)
```

**Implementation:**
1. Create batch processing endpoint
2. Deploy to VPS
3. Create n8n workflow with schedule trigger
4. Call VPS endpoint on schedule
5. Store results

### Pattern 3: GitHub-Triggered Deploy

```
Git Push → GitHub Webhook → n8n → Hostinger Redeploy
```

**Implementation:**
1. Create n8n webhook
2. Configure GitHub repo webhook to call n8n
3. n8n workflow triggers `VPS_updateProjectV1`
4. App auto-updates on git push

---

## Deployment Checklist

### Before Deployment

```markdown
- [ ] Application code complete
- [ ] Dockerfile created and tested locally
- [ ] docker-compose.yml configured
- [ ] Environment variables documented
- [ ] Git repository created
- [ ] All code committed and pushed
```

### During Deployment

```markdown
- [ ] VPS instance identified
- [ ] Docker project created via MCP
- [ ] Container running successfully
- [ ] DNS configured (if using custom domain)
- [ ] Firewall rules set
- [ ] SSL/HTTPS configured (if needed)
```

### Post-Deployment

```markdown
- [ ] Endpoint accessible
- [ ] n8n workflow created
- [ ] Webhook connections verified
- [ ] End-to-end test completed
- [ ] Monitoring in place
- [ ] Documentation updated
```

---

## Troubleshooting Integration Issues

### Issue: n8n Can't Reach VPS

```markdown
1. Check VPS is running:
   `VPS_getVirtualMachineDetailsV1`

2. Check Docker project:
   `VPS_getProjectContainersV1`

3. Check firewall allows port:
   `VPS_getFirewallDetailsV1`

4. Verify correct URL in n8n
```

### Issue: Deployment Fails

```markdown
1. Check Docker logs:
   `VPS_getProjectLogsV1`

2. Verify docker-compose.yml syntax

3. Check if port is available

4. Verify environment variables set
```

### Issue: Webhook Not Triggering

```markdown
1. Test webhook URL directly:
   `curl -X POST http://url -d '{"test": true}'`

2. Check n8n execution history

3. Verify external service is sending correctly

4. Check authentication if required
```

---

## Quick Commands

### Check All Systems

```bash
# Git status
git status && git log --oneline -3

# GitHub
gh repo view && gh pr list

# Hostinger VPS (via MCP)
# VPS_getVirtualMachinesV1
# VPS_getProjectListV1

# n8n
curl -s ${N8N_HOST}/api/v1/workflows -H "X-N8N-API-KEY: ${N8N_API_KEY}" | jq '.data | length'
```

### Deploy Update

```bash
# 1. Commit changes
git add . && git commit -m "Update"

# 2. Push to GitHub
git push origin main

# 3. Redeploy on Hostinger (via MCP)
# VPS_updateProjectV1 with project_name

# 4. Verify
# VPS_getProjectLogsV1
```

---

## Project Template

### Folder Structure

```
my-project/
├── src/                    # Application code
├── api/                    # Serverless functions (Vercel)
├── public/                 # Static files
├── workflows/              # n8n workflow JSON files
├── docs/                   # Documentation
├── sops/                   # Standard Operating Procedures
│   ├── N8N-WORKFLOW-MANAGEMENT-SOP.md
│   ├── HOSTINGER-MCP-SOP.md
│   ├── GITHUB-GIT-SOP.md
│   └── MASTER-INTEGRATION-SOP.md
├── Dockerfile
├── docker-compose.yml
├── package.json
├── .env.example
├── .gitignore
├── .mcp.json               # MCP configuration
└── README.md
```

### .gitignore Template

```gitignore
node_modules/
.env
output/
temp/
*.log
.DS_Store
```

### docker-compose.yml Template

```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
    restart: unless-stopped
    volumes:
      - app-data:/app/data

volumes:
  app-data:
```

---

## Success Metrics

When this stack is working correctly:

| Metric | Target |
|--------|--------|
| Deploy time | < 5 minutes |
| Webhook response | < 30 seconds |
| n8n workflow success rate | > 99% |
| VPS uptime | > 99.9% |
| Git commit frequency | Multiple per session |

---

## Summary

This integration enables:

1. **Rapid Development** - Claude Code writes and iterates on code
2. **Version Control** - Git/GitHub tracks all changes
3. **Instant Deployment** - Hostinger MCP deploys in minutes
4. **Full Automation** - n8n connects everything together

The result: **Ideas become deployed, automated applications in a single session.**

---

*Last Updated: December 2025*
