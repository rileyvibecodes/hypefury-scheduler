# Hostinger MCP SOP for Claude Code

This SOP enables Claude Code to deploy applications, manage VPS instances, configure DNS, and handle hosting operations via the Hostinger API MCP.

---

## Table of Contents

1. [Overview](#overview)
2. [MCP Configuration](#mcp-configuration)
3. [VPS & Docker Deployment](#vps--docker-deployment)
4. [Hosting & Website Management](#hosting--website-management)
5. [Domain & DNS Management](#domain--dns-management)
6. [Billing & Subscriptions](#billing--subscriptions)
7. [Security & Firewalls](#security--firewalls)
8. [Deployment Workflows](#deployment-workflows)
9. [Troubleshooting](#troubleshooting)

---

## Overview

The Hostinger MCP provides Claude Code with direct access to:

| Category | Capabilities |
|----------|--------------|
| **VPS Management** | Create, start, stop, restart virtual machines |
| **Docker Projects** | Deploy, update, manage Docker Compose projects |
| **Hosting** | Deploy static sites, JS apps, WordPress |
| **Domains** | Register, configure, manage domains |
| **DNS** | Full DNS record management |
| **Firewalls** | Create and manage firewall rules |
| **SSL/Security** | Manage certificates and security settings |

---

## MCP Configuration

### Setup in .mcp.json

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

### Getting Your API Token

1. Log in to [hPanel](https://hpanel.hostinger.com/)
2. Navigate to **Account** → **API Tokens**
3. Create a new token with required permissions
4. Copy and add to `.mcp.json`

### Verify MCP is Working

Claude Code will have access to `mcp__hostinger-api__*` tools when properly configured.

---

## VPS & Docker Deployment

### Understanding the VPS Workflow

```
1. Get VPS List → 2. Check Status → 3. Deploy Docker Project → 4. Monitor
```

### List Available VPS Instances

**Tool:** `mcp__hostinger-api__VPS_getVirtualMachinesV1`

Returns all VPS instances with:
- Virtual Machine ID
- Hostname
- IP addresses
- Status (running, stopped, etc.)
- OS template

### Get VPS Details

**Tool:** `mcp__hostinger-api__VPS_getVirtualMachineDetailsV1`

**Parameters:**
```json
{
  "virtualMachineId": 12345
}
```

### Deploy Docker Compose Project

**Tool:** `mcp__hostinger-api__VPS_createNewProjectV1`

This is the primary deployment method for applications.

**Parameters:**
```json
{
  "virtualMachineId": 12345,
  "project_name": "my-app",
  "content": "version: '3.8'\nservices:\n  app:\n    image: node:18\n    ports:\n      - '3000:3000'",
  "environment": "NODE_ENV=production\nPORT=3000"
}
```

**Content Options:**
1. **Raw YAML** - Inline docker-compose.yml content
2. **GitHub URL** - `https://github.com/user/repo` (auto-fetches docker-compose.yml)
3. **Direct URL** - URL to raw docker-compose.yml file

### Docker Project Operations

| Operation | Tool | Parameters |
|-----------|------|------------|
| List Projects | `VPS_getProjectListV1` | `virtualMachineId` |
| Get Project | `VPS_getProjectContentsV1` | `virtualMachineId`, `projectName` |
| Get Containers | `VPS_getProjectContainersV1` | `virtualMachineId`, `projectName` |
| View Logs | `VPS_getProjectLogsV1` | `virtualMachineId`, `projectName` |
| Start | `VPS_startProjectV1` | `virtualMachineId`, `projectName` |
| Stop | `VPS_stopProjectV1` | `virtualMachineId`, `projectName` |
| Restart | `VPS_restartProjectV1` | `virtualMachineId`, `projectName` |
| Update | `VPS_updateProjectV1` | `virtualMachineId`, `projectName` |
| Delete | `VPS_deleteProjectV1` | `virtualMachineId`, `projectName` |

### Example: Full Docker Deployment

```markdown
## Deployment Steps

1. **Get VPS ID**
   Use `VPS_getVirtualMachinesV1` to list VPS instances

2. **Prepare Docker Compose**
   ```yaml
   version: '3.8'
   services:
     app:
       build: .
       ports:
         - "3000:3000"
       environment:
         - NODE_ENV=production
       restart: unless-stopped
   ```

3. **Deploy Project**
   Use `VPS_createNewProjectV1` with:
   - virtualMachineId: [your-vps-id]
   - project_name: "my-application"
   - content: [docker-compose content or GitHub URL]

4. **Verify Deployment**
   Use `VPS_getProjectContainersV1` to check container status

5. **View Logs if Issues**
   Use `VPS_getProjectLogsV1` to debug
```

### VPS Control Operations

| Operation | Tool | Use Case |
|-----------|------|----------|
| Start VPS | `VPS_startVirtualMachineV1` | Power on stopped VPS |
| Stop VPS | `VPS_stopVirtualMachineV1` | Graceful shutdown |
| Restart VPS | `VPS_restartVirtualMachineV1` | Full reboot |
| Set Hostname | `VPS_setHostnameV1` | Configure hostname |
| Set Root Password | `VPS_setRootPasswordV1` | Update root access |
| Recovery Mode | `VPS_startRecoveryModeV1` | System rescue |

### VPS Metrics & Monitoring

**Tool:** `mcp__hostinger-api__VPS_getMetricsV1`

**Parameters:**
```json
{
  "virtualMachineId": 12345,
  "date_from": "2025-12-01",
  "date_to": "2025-12-07"
}
```

Returns: CPU, memory, disk, network usage, uptime.

---

## Hosting & Website Management

### List Hosting Orders

**Tool:** `mcp__hostinger-api__hosting_listOrdersV1`

Lists all hosting accounts with their status.

### List Websites

**Tool:** `mcp__hostinger-api__hosting_listWebsitesV1`

**Parameters:**
```json
{
  "domain": "example.com",  // Optional filter
  "is_enabled": true,
  "page": 1,
  "per_page": 20
}
```

### Create Website

**Tool:** `mcp__hostinger-api__hosting_createWebsiteV1`

**Parameters:**
```json
{
  "domain": "mysite.com",
  "order_id": 12345,
  "datacenter_code": "us"  // Required for first website on new plan
}
```

### Deploy Static Website

**Tool:** `mcp__hostinger-api__hosting_deployStaticWebsite`

For pre-built static sites (HTML, CSS, JS only - no build step).

**Parameters:**
```json
{
  "domain": "example.com",
  "archivePath": "/path/to/static-site.zip",
  "removeArchive": true
}
```

**Important:** Archive must contain ready-to-serve files. For sites with build steps, use JS Application deployment.

### Deploy JavaScript Application

**Tool:** `mcp__hostinger-api__hosting_deployJsApplication`

For Node.js apps with build processes (React, Next.js, Vue, etc.).

**Parameters:**
```json
{
  "domain": "example.com",
  "archivePath": "/path/to/app-source.zip",
  "removeArchive": true
}
```

**Archive Requirements:**
- Include source files only
- Exclude `node_modules/`
- Exclude build output (`dist/`, `build/`)
- Exclude files matched by `.gitignore`

### Check JS Deployment Status

**Tool:** `mcp__hostinger-api__hosting_listJsDeployments`

**Parameters:**
```json
{
  "domain": "example.com",
  "states": ["pending", "running", "completed", "failed"]
}
```

### View Deployment Logs

**Tool:** `mcp__hostinger-api__hosting_showJsDeploymentLogs`

**Parameters:**
```json
{
  "domain": "example.com",
  "buildUuid": "deployment-uuid-here",
  "fromLine": 0
}
```

### Deploy WordPress

**Tool:** `mcp__hostinger-api__hosting_importWordpressWebsite`

**Parameters:**
```json
{
  "domain": "example.com",
  "archivePath": "/path/to/wordpress-backup.zip",
  "databaseDump": "/path/to/database.sql"
}
```

### Deploy WordPress Plugin

**Tool:** `mcp__hostinger-api__hosting_deployWordpressPlugin`

**Parameters:**
```json
{
  "domain": "example.com",
  "slug": "my-plugin",
  "pluginPath": "/path/to/plugin-directory"
}
```

### Deploy WordPress Theme

**Tool:** `mcp__hostinger-api__hosting_deployWordpressTheme`

**Parameters:**
```json
{
  "domain": "example.com",
  "slug": "my-theme",
  "themePath": "/path/to/theme-directory",
  "activate": true
}
```

---

## Domain & DNS Management

### List Domains

**Tool:** `mcp__hostinger-api__domains_getDomainListV1`

Lists all domains in your account.

### Get Domain Details

**Tool:** `mcp__hostinger-api__domains_getDomainDetailsV1`

**Parameters:**
```json
{
  "domain": "example.com"
}
```

### Check Domain Availability

**Tool:** `mcp__hostinger-api__domains_checkDomainAvailabilityV1`

**Parameters:**
```json
{
  "domain": "mynewsite",
  "tlds": ["com", "net", "io"],
  "with_alternatives": true
}
```

### Purchase Domain

**Tool:** `mcp__hostinger-api__domains_purchaseNewDomainV1`

**Parameters:**
```json
{
  "domain": "example.com",
  "item_id": "catalog-item-id"
}
```

### DNS Record Management

#### Get DNS Records

**Tool:** `mcp__hostinger-api__DNS_getDNSRecordsV1`

**Parameters:**
```json
{
  "domain": "example.com"
}
```

#### Update DNS Records

**Tool:** `mcp__hostinger-api__DNS_updateDNSRecordsV1`

**Parameters:**
```json
{
  "domain": "example.com",
  "overwrite": false,
  "zone": [
    {
      "name": "@",
      "type": "A",
      "ttl": 3600,
      "records": [{ "content": "123.45.67.89" }]
    },
    {
      "name": "www",
      "type": "CNAME",
      "ttl": 3600,
      "records": [{ "content": "example.com" }]
    }
  ]
}
```

**Record Types:** A, AAAA, CNAME, ALIAS, MX, TXT, NS, SOA, SRV, CAA

#### Common DNS Patterns

**Point Domain to VPS:**
```json
{
  "zone": [
    { "name": "@", "type": "A", "ttl": 3600, "records": [{ "content": "VPS_IP" }] },
    { "name": "www", "type": "A", "ttl": 3600, "records": [{ "content": "VPS_IP" }] }
  ]
}
```

**Add Subdomain:**
```json
{
  "zone": [
    { "name": "api", "type": "A", "ttl": 3600, "records": [{ "content": "VPS_IP" }] }
  ]
}
```

**Email (MX) Records:**
```json
{
  "zone": [
    { "name": "@", "type": "MX", "ttl": 3600, "records": [{ "content": "10 mail.example.com" }] }
  ]
}
```

### Domain Lock/Unlock

```markdown
- Lock: `domains_enableDomainLockV1` - Prevent unauthorized transfers
- Unlock: `domains_disableDomainLockV1` - Allow domain transfer
```

### Privacy Protection

```markdown
- Enable: `domains_enablePrivacyProtectionV1` - Hide WHOIS info
- Disable: `domains_disablePrivacyProtectionV1` - Show WHOIS info
```

### Set Nameservers

**Tool:** `mcp__hostinger-api__domains_updateDomainNameserversV1`

**Parameters:**
```json
{
  "domain": "example.com",
  "ns1": "ns1.hostinger.com",
  "ns2": "ns2.hostinger.com"
}
```

---

## Billing & Subscriptions

### List Payment Methods

**Tool:** `mcp__hostinger-api__billing_getPaymentMethodListV1`

### List Subscriptions

**Tool:** `mcp__hostinger-api__billing_getSubscriptionListV1`

### Get Catalog Items

**Tool:** `mcp__hostinger-api__billing_getCatalogItemListV1`

**Parameters:**
```json
{
  "category": "VPS",  // or "DOMAIN"
  "name": "KVM*"      // Optional filter with wildcards
}
```

### Enable/Disable Auto-Renewal

```markdown
- Enable: `billing_enableAutoRenewalV1`
- Disable: `billing_disableAutoRenewalV1`
```

---

## Security & Firewalls

### Create Firewall

**Tool:** `mcp__hostinger-api__VPS_createNewFirewallV1`

**Parameters:**
```json
{
  "name": "Web Server Firewall"
}
```

### Add Firewall Rules

**Tool:** `mcp__hostinger-api__VPS_createFirewallRuleV1`

**Parameters:**
```json
{
  "firewallId": 123,
  "protocol": "TCP",
  "port": "80",
  "source": "any",
  "source_detail": "any"
}
```

**Common Rules:**
```json
// HTTP
{ "protocol": "HTTP", "port": "80", "source": "any", "source_detail": "any" }

// HTTPS
{ "protocol": "HTTPS", "port": "443", "source": "any", "source_detail": "any" }

// SSH (restrict to your IP)
{ "protocol": "SSH", "port": "22", "source": "custom", "source_detail": "YOUR_IP" }

// Custom port range
{ "protocol": "TCP", "port": "3000:3010", "source": "any", "source_detail": "any" }
```

### Activate Firewall on VPS

**Tool:** `mcp__hostinger-api__VPS_activateFirewallV1`

**Parameters:**
```json
{
  "firewallId": 123,
  "virtualMachineId": 456
}
```

### SSH Key Management

**Add SSH Key:**
```markdown
Tool: `VPS_createPublicKeyV1`
Parameters: { "name": "My Key", "key": "ssh-rsa AAAA..." }
```

**Attach to VPS:**
```markdown
Tool: `VPS_attachPublicKeyV1`
Parameters: { "virtualMachineId": 123, "ids": [456] }
```

### Malware Scanner (Monarx)

```markdown
- Install: `VPS_installMonarxV1`
- Uninstall: `VPS_uninstallMonarxV1`
- Get Metrics: `VPS_getScanMetricsV1`
```

---

## Deployment Workflows

### Complete App Deployment Workflow

```markdown
## Deploying a Node.js App to VPS

### Prerequisites
- [ ] VPS instance running
- [ ] Domain configured
- [ ] Docker Compose file ready

### Step 1: Prepare Docker Compose
Create `docker-compose.yml`:
```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    restart: unless-stopped
```

### Step 2: Get VPS Information
Use `VPS_getVirtualMachinesV1` to get:
- Virtual Machine ID
- IP Address

### Step 3: Deploy Docker Project
Use `VPS_createNewProjectV1`:
- project_name: "my-app"
- content: [GitHub URL or docker-compose content]
- environment: Required env vars

### Step 4: Configure DNS
Use `DNS_updateDNSRecordsV1` to point domain to VPS IP

### Step 5: Verify Deployment
- Use `VPS_getProjectContainersV1` to check status
- Use `VPS_getProjectLogsV1` if issues

### Step 6: Configure Firewall (Optional)
- Create firewall with required rules
- Activate on VPS
```

### Quick Deploy from GitHub

```markdown
## GitHub → VPS Deployment

1. Ensure repository has docker-compose.yml at root
2. Use `VPS_createNewProjectV1` with GitHub URL:
   ```json
   {
     "virtualMachineId": 123,
     "project_name": "app-name",
     "content": "https://github.com/username/repo"
   }
   ```
3. Hostinger will auto-fetch and deploy
```

### Update Existing Deployment

```markdown
## Updating a Running Project

1. **Option A: In-Place Update**
   Use `VPS_updateProjectV1`:
   - Pulls latest images
   - Recreates containers
   - Preserves volumes

2. **Option B: Redeploy**
   Use `VPS_createNewProjectV1` with same project_name:
   - Replaces existing project
   - Fresh deployment

3. **Verify**
   Check containers and logs after update
```

---

## Troubleshooting

### Docker Project Won't Start

1. **Check Logs:**
   ```
   VPS_getProjectLogsV1
   ```

2. **Verify Docker Compose Syntax:**
   - Valid YAML format
   - All required services defined
   - Ports not conflicting

3. **Check Container Status:**
   ```
   VPS_getProjectContainersV1
   ```

### DNS Not Propagating

1. **Verify Records Set:**
   ```
   DNS_getDNSRecordsV1
   ```

2. **Check TTL:**
   - Lower TTL = faster propagation
   - Wait for old TTL to expire

3. **Validate Record Format:**
   - Use `DNS_validateDNSRecordsV1` before applying

### VPS Not Accessible

1. **Check VPS Status:**
   ```
   VPS_getVirtualMachineDetailsV1
   ```

2. **Verify Firewall:**
   - Check rules allow required ports
   - SSH (22), HTTP (80), HTTPS (443)

3. **Check if Recovery Mode Needed:**
   ```
   VPS_startRecoveryModeV1
   ```

### Deployment Fails

1. **For JS Apps:**
   - Check `hosting_showJsDeploymentLogs`
   - Verify package.json has build script
   - Check node version compatibility

2. **For Docker:**
   - Verify Dockerfile exists
   - Check build context
   - Review container logs

---

## Quick Reference

### Most Used Tools

| Task | Tool |
|------|------|
| List VPS | `VPS_getVirtualMachinesV1` |
| Deploy Docker | `VPS_createNewProjectV1` |
| View Logs | `VPS_getProjectLogsV1` |
| Update DNS | `DNS_updateDNSRecordsV1` |
| List Domains | `domains_getDomainListV1` |
| Deploy Static Site | `hosting_deployStaticWebsite` |
| Deploy JS App | `hosting_deployJsApplication` |

### Environment Setup Checklist

```markdown
- [ ] API Token in .mcp.json
- [ ] VPS provisioned and running
- [ ] Domain registered/configured
- [ ] DNS pointing to VPS
- [ ] Firewall rules configured
- [ ] SSH keys attached (optional)
```

---

*Last Updated: December 2025*
