# Project: [PROJECT_NAME]

## Overview
[Brief description of what this project does]

## Tech Stack
- Node.js / [Framework]
- Docker for deployment
- Hostinger VPS for hosting
- n8n for automation

## MCP Configuration
This project uses the Hostinger MCP. Ensure `.mcp.json` is configured:
```json
{
  "mcpServers": {
    "hostinger-api": {
      "command": "hostinger-api-mcp",
      "env": {
        "DEBUG": "false",
        "APITOKEN": "your-token-here"
      }
    }
  }
}
```

## Standard Operating Procedures
Reference SOPs in `sops/` folder:
- **n8n Workflows**: `sops/N8N-WORKFLOW-MANAGEMENT-SOP.md`
- **Hostinger Deployment**: `sops/HOSTINGER-MCP-SOP.md`
- **Git/GitHub**: `sops/GITHUB-GIT-SOP.md`
- **Full Integration**: `sops/MASTER-INTEGRATION-SOP.md`

## Project Structure
```
project/
├── src/                # Application code
├── api/                # Serverless functions
├── public/             # Static files
├── workflows/          # n8n workflow JSON files
├── docs/               # Documentation
├── sops/               # Standard Operating Procedures
├── Dockerfile
├── docker-compose.yml
├── package.json
├── .env.example
├── .mcp.json
└── CLAUDE.md
```

## Development Commands
```bash
npm install          # Install dependencies
npm start            # Run application
npm run dev          # Development mode
npm run build        # Build for production
```

## Deployment
1. Commit and push to GitHub
2. Deploy via Hostinger MCP: `VPS_createNewProjectV1` or `VPS_updateProjectV1`
3. Verify: `VPS_getProjectLogsV1`

## Environment Variables
Copy `.env.example` to `.env` and configure required variables.
