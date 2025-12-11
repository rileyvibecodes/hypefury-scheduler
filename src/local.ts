import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { makeHfRequest, HF_AUTH_ENDPOINT, HF_SCHEDULE_ENDPOINT } from './utils.js';

/**
 * Local development server for MCP Inspector testing
 * Run with: npx @modelcontextprotocol/inspector node build/local.js
 */

const server = new McpServer({
  name: "Hypefury MCP (Local)",
  version: "1.0.0",
});

server.tool(
  "auth",
  "Authenticate with Hypefury",
  {},
  async () => {
    const response = await makeHfRequest(HF_AUTH_ENDPOINT);

    if (!response) {
      return {
        content: [
          {
            type: "text",
            text: "Unable to authenticate with Hypefury."
          }
        ]
      };
    }

    if (response.statusCode === 409) {
      return {
        content: [
          {
            type: "text",
            text: "Already authenticated with Hypefury."
          }
        ]
      };
    } else if (response.statusCode === 403) {
      return {
        content: [
          {
            type: "text",
            text: "Invalid API key."
          }
        ]
      };
    } else if (response.statusCode === 200) {
      return {
        content: [
          {
            type: "text",
            text: "Successfully authenticated with Hypefury. You can now schedule posts."
          }
        ]
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `Unexpected response: ${response.statusCode || 'unknown'}`
        }
      ]
    };
  }
);

server.tool(
  "schedule_post",
  "Schedule a post to be published via Hypefury",
  {
    message: z.string().describe("The message content to post"),
    scheduledTime: z.string().optional().describe("ISO 8601 datetime for when to publish (e.g., '2024-12-15T10:00:00Z'). If not provided, post will be added to queue.")
  },
  async ({ message, scheduledTime }: { message: string; scheduledTime?: string }) => {
    const postData: Record<string, unknown> = {
      text: message
    };

    if (scheduledTime) {
      postData.time = scheduledTime;
    }

    const response = await makeHfRequest(HF_SCHEDULE_ENDPOINT, JSON.stringify(postData));

    if (!response) {
      return {
        content: [
          {
            type: "text",
            text: "Unable to schedule post."
          }
        ]
      };
    }

    if (response.statusCode === 200 || response.statusCode === 201) {
      return {
        content: [
          {
            type: "text",
            text: scheduledTime
              ? `Post scheduled successfully for ${scheduledTime}.`
              : "Post added to queue successfully."
          }
        ]
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `Failed to schedule post: ${response.message || response.statusCode}`
        }
      ]
    };
  }
);

server.tool(
  "schedule_bulk",
  "Schedule multiple posts at once via Hypefury",
  {
    posts: z.array(z.object({
      message: z.string().describe("The message content to post"),
      scheduledTime: z.string().optional().describe("ISO 8601 datetime for when to publish")
    })).describe("Array of posts to schedule")
  },
  async ({ posts }: { posts: Array<{ message: string; scheduledTime?: string }> }) => {
    const results: string[] = [];
    let successCount = 0;
    let failCount = 0;

    for (const post of posts) {
      const postData: Record<string, unknown> = {
        text: post.message
      };

      if (post.scheduledTime) {
        postData.time = post.scheduledTime;
      }

      const response = await makeHfRequest(HF_SCHEDULE_ENDPOINT, JSON.stringify(postData));

      if (response && (response.statusCode === 200 || response.statusCode === 201)) {
        successCount++;
        results.push(`✓ Post scheduled: "${post.message.substring(0, 50)}..."`);
      } else {
        failCount++;
        results.push(`✗ Failed: "${post.message.substring(0, 50)}..." - ${response?.message || 'Unknown error'}`);
      }
    }

    return {
      content: [
        {
          type: "text",
          text: `Bulk scheduling complete.\nSuccess: ${successCount}/${posts.length}\nFailed: ${failCount}/${posts.length}\n\nDetails:\n${results.join('\n')}`
        }
      ]
    };
  }
);

console.log("Starting Hypefury MCP Local Server...");
console.log("Use with MCP Inspector: npx @modelcontextprotocol/inspector node build/local.js");

const transport = new StdioServerTransport();
server.connect(transport);
