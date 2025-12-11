# Hypefury MCP Server

This project is a Model Context Protocol (MCP) server for integrating with Hypefury, a social media scheduling and growth platform. The server provides tools for authenticating with Hypefury and scheduling posts, with full support for N8N automation workflows.

## Features

- Authentication with Hypefury API
- Single post scheduling with optional scheduled time
- Bulk scheduling for multiple posts at once
- N8N webhook integration for automation workflows
- CORS support for external integrations
- Request validation using Zod
- Deployment-ready for Smithery.ai
- Local testing capability

## Getting Started

### Prerequisites

- Node.js 16 or higher
- npm or yarn
- Hypefury API key (get from your Hypefury account settings)

### Installation

```bash
# Clone the repository
git clone https://github.com/Hypefury/hypefury-mcp.git
cd hypefury-mcp

# Install dependencies
npm install

# Build the project
npm run build
```

### Environment Variables

Create a `.env` file in the root directory:

```env
HF_API_KEY=your_hypefury_api_key
PORT=8080
```

Alternatively, when deploying to Smithery, set these as environment secrets.

## Running the Server

### HTTP Server (for N8N and API integrations)

```bash
# Build and start the HTTP server
npm run dev:server
```

The server will start on port 8080 (or your configured PORT). Available endpoints:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/info` | API information and endpoint listing |
| POST | `/api/auth` | Authenticate with Hypefury |
| POST | `/api/schedule` | Schedule a single post |
| POST | `/api/schedule/bulk` | Schedule multiple posts at once |
| POST | `/webhook/schedule-content` | N8N webhook endpoint |

### MCP Server (for AI assistants)

```bash
# Start the MCP server (stdio transport)
npm start
```

## API Usage

### Schedule a Single Post

```bash
curl -X POST http://localhost:8080/api/schedule \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello world! This is my scheduled post.",
    "scheduledTime": "2024-12-15T10:00:00Z"
  }'
```

Response:
```json
{
  "success": true,
  "message": "Post scheduled successfully for 2024-12-15T10:00:00Z."
}
```

### Schedule Multiple Posts (Bulk)

```bash
curl -X POST http://localhost:8080/api/schedule/bulk \
  -H "Content-Type: application/json" \
  -d '{
    "posts": [
      { "text": "First post content", "scheduledTime": "2024-12-15T10:00:00Z" },
      { "text": "Second post content", "scheduledTime": "2024-12-15T14:00:00Z" },
      { "text": "Third post - add to queue" }
    ]
  }'
```

Response:
```json
{
  "success": true,
  "message": "Scheduled 3/3 posts successfully",
  "summary": {
    "total": 3,
    "success": 3,
    "failed": 0
  },
  "results": [...]
}
```

## N8N Integration

### Setting Up N8N Workflow

1. **Deploy the HTTP server** to a publicly accessible URL (e.g., using Docker, Heroku, or your own server)

2. **Create an N8N workflow** with the following structure:
   - Trigger: Webhook node (receives Google Doc URL or content)
   - Process: HTTP Request node to fetch/parse Google Doc
   - Transform: Code/Function node to extract posts
   - Output: HTTP Request node to call this scheduler

3. **Configure the HTTP Request node** in N8N:
   - Method: POST
   - URL: `https://your-server.com/webhook/schedule-content`
   - Body Content Type: JSON
   - Body:
     ```json
     {
       "posts": [
         { "text": "{{ $json.post1 }}", "scheduledTime": "{{ $json.time1 }}" },
         { "text": "{{ $json.post2 }}", "scheduledTime": "{{ $json.time2 }}" }
       ]
     }
     ```

### N8N Webhook Payload Formats

The `/webhook/schedule-content` endpoint accepts multiple formats:

**Format 1: Posts Array**
```json
{
  "posts": [
    { "text": "Post content", "scheduledTime": "2024-12-15T10:00:00Z" }
  ]
}
```

**Format 2: Items Array (common N8N format)**
```json
{
  "items": [
    { "text": "Post content", "time": "2024-12-15T10:00:00Z" },
    { "message": "Another post" }
  ]
}
```

**Format 3: Single Content String**
```json
{
  "content": "Single post to schedule"
}
```

## Local Testing

Test the MCP server locally with MCP Inspector:

```bash
# Build and run with local transport
npm run dev:local
```

Or use MCP Inspector:

```bash
npx @modelcontextprotocol/inspector node build/local.js
```

Then open http://localhost:5173 in your browser.

## Docker Deployment

```bash
# Build the Docker image
docker build -t hypefury-scheduler .

# Run the container
docker run -p 8080:8080 -e HF_API_KEY=your_api_key hypefury-scheduler
```

Or use Docker Compose:

```bash
docker-compose up -d
```

## Deployment to Smithery

1. Push this repository to GitHub
2. Create a new server on Smithery.ai
3. Connect to this repository
4. Set `HF_API_KEY` as a secret
5. Deploy

## MCP Tools

This MCP server provides the following tools for AI assistants:

| Tool | Description |
|------|-------------|
| `auth` | Authenticate with Hypefury |
| `schedule_post` | Schedule a single post (with optional scheduledTime) |
| `schedule_bulk` | Schedule multiple posts at once |

### Example Tool Usage

```typescript
// Schedule a single post
await server.callTool("schedule_post", {
  message: "Hello world!",
  scheduledTime: "2024-12-15T10:00:00Z"
});

// Schedule multiple posts
await server.callTool("schedule_bulk", {
  posts: [
    { message: "Post 1", scheduledTime: "2024-12-15T10:00:00Z" },
    { message: "Post 2", scheduledTime: "2024-12-15T14:00:00Z" }
  ]
});
```

## Troubleshooting

### Common Issues

1. **"API key is missing"** - Ensure `HF_API_KEY` is set in your `.env` file or environment variables

2. **"Invalid API key"** - Verify your Hypefury API key is correct and active

3. **CORS errors** - The server includes CORS headers by default. If you're still seeing issues, check your client configuration

4. **N8N webhook not working** - Ensure your server is publicly accessible and the URL is correct in your N8N workflow

### Debug Mode

For verbose logging, check the server console output. All requests are logged with timestamps and payload details.

## License

MIT
