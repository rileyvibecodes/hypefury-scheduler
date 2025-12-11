import express, { Request, Response, NextFunction } from 'express';
import { makeHfRequest, HF_AUTH_ENDPOINT, HF_SCHEDULE_ENDPOINT } from './utils.js';
import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;

// CORS middleware for N8N and external integrations
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (_req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Request logging middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Request body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// Validation schemas
const SchedulePostSchema = z.object({
  message: z.string().optional(),
  text: z.string().optional(),
  scheduledTime: z.string().optional(),
  time: z.string().optional()
}).refine(data => data.message || data.text, {
  message: 'Either "message" or "text" is required'
});

const BulkScheduleSchema = z.object({
  posts: z.array(z.object({
    message: z.string().optional(),
    text: z.string().optional(),
    scheduledTime: z.string().optional(),
    time: z.string().optional()
  }).refine(data => data.message || data.text, {
    message: 'Either "message" or "text" is required for each post'
  }))
});

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'hypefury-scheduler',
    timestamp: new Date().toISOString()
  });
});

// Authentication endpoint
app.post('/api/auth', async (_req: Request, res: Response) => {
  try {
    const response = await makeHfRequest(HF_AUTH_ENDPOINT);

    if (!response) {
      return res.status(500).json({
        success: false,
        message: 'Unable to authenticate with Hypefury.'
      });
    }

    if (response.statusCode === 409) {
      return res.status(200).json({
        success: true,
        message: 'Already authenticated with Hypefury.'
      });
    } else if (response.statusCode === 403) {
      return res.status(403).json({
        success: false,
        message: 'Invalid API key.'
      });
    } else if (response.statusCode === 200) {
      return res.status(200).json({
        success: true,
        message: 'Successfully authenticated with Hypefury. You can now schedule posts.'
      });
    }

    return res.status(response.statusCode || 500).json({
      success: false,
      message: `Unexpected response: ${response.statusCode || 'unknown'}`
    });
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(500).json({
      success: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`
    });
  }
});

// Schedule single post endpoint (N8N compatible)
app.post('/api/schedule', async (req: Request, res: Response) => {
  try {
    // Validate request body
    const validation = SchedulePostSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: validation.error.errors[0]?.message || 'Invalid request body',
        errors: validation.error.errors
      });
    }

    const { message, text, scheduledTime, time } = validation.data;
    const postContent = message || text;
    const postTime = scheduledTime || time;

    const postData: Record<string, unknown> = {
      text: postContent
    };

    if (postTime) {
      postData.time = postTime;
    }

    console.log('Scheduling post:', postData);
    const response = await makeHfRequest(HF_SCHEDULE_ENDPOINT, JSON.stringify(postData));

    if (!response) {
      return res.status(500).json({
        success: false,
        message: 'Unable to schedule post.'
      });
    }

    if (response.statusCode === 200 || response.statusCode === 201) {
      let responseData = null;
      try {
        responseData = response.message ? JSON.parse(response.message) : null;
      } catch {
        responseData = response.message;
      }

      return res.status(200).json({
        success: true,
        message: postTime
          ? `Post scheduled successfully for ${postTime}.`
          : 'Post added to queue successfully.',
        data: responseData
      });
    }

    return res.status(response.statusCode || 500).json({
      success: false,
      message: response.message || 'Failed to schedule post',
      statusCode: response.statusCode
    });
  } catch (error) {
    console.error('Schedule error:', error);
    return res.status(500).json({
      success: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`
    });
  }
});

// Bulk schedule endpoint (for N8N to send multiple posts)
app.post('/api/schedule/bulk', async (req: Request, res: Response) => {
  try {
    // Validate request body
    const validation = BulkScheduleSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: validation.error.errors[0]?.message || 'Invalid request body',
        errors: validation.error.errors
      });
    }

    const { posts } = validation.data;
    const results: Array<{
      index: number;
      success: boolean;
      message: string;
      preview: string;
    }> = [];

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      const postContent = post.message || post.text;
      const postTime = post.scheduledTime || post.time;

      const postData: Record<string, unknown> = {
        text: postContent
      };

      if (postTime) {
        postData.time = postTime;
      }

      console.log(`Scheduling post ${i + 1}/${posts.length}:`, postData);
      const response = await makeHfRequest(HF_SCHEDULE_ENDPOINT, JSON.stringify(postData));

      if (response && (response.statusCode === 200 || response.statusCode === 201)) {
        successCount++;
        results.push({
          index: i,
          success: true,
          message: postTime ? `Scheduled for ${postTime}` : 'Added to queue',
          preview: postContent?.substring(0, 50) + (postContent && postContent.length > 50 ? '...' : '') || ''
        });
      } else {
        failCount++;
        results.push({
          index: i,
          success: false,
          message: response?.message || `HTTP ${response?.statusCode || 'Unknown'}`,
          preview: postContent?.substring(0, 50) + (postContent && postContent.length > 50 ? '...' : '') || ''
        });
      }

      // Small delay between requests to avoid rate limiting
      if (i < posts.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    return res.status(200).json({
      success: failCount === 0,
      message: `Scheduled ${successCount}/${posts.length} posts successfully`,
      summary: {
        total: posts.length,
        success: successCount,
        failed: failCount
      },
      results
    });
  } catch (error) {
    console.error('Bulk schedule error:', error);
    return res.status(500).json({
      success: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`
    });
  }
});

// N8N webhook endpoint - accepts Google Doc URL and posts array
app.post('/webhook/schedule-content', async (req: Request, res: Response) => {
  try {
    console.log('N8N webhook received:', JSON.stringify(req.body, null, 2));

    // Handle different payload formats from N8N
    const { posts, url, content, items } = req.body;

    // If posts array is provided directly
    if (posts && Array.isArray(posts)) {
      const validation = BulkScheduleSchema.safeParse({ posts });
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          message: 'Invalid posts format',
          errors: validation.error.errors
        });
      }

      // Reuse bulk schedule logic
      req.body = { posts };
      return app._router.handle(
        Object.assign(req, { url: '/api/schedule/bulk', originalUrl: '/api/schedule/bulk' }),
        res,
        () => {}
      );
    }

    // If items array is provided (common N8N format)
    if (items && Array.isArray(items)) {
      const formattedPosts = items.map((item: { text?: string; message?: string; content?: string; scheduledTime?: string; time?: string }) => ({
        text: item.text || item.message || item.content,
        scheduledTime: item.scheduledTime || item.time
      })).filter((p: { text?: string }) => p.text);

      if (formattedPosts.length > 0) {
        req.body = { posts: formattedPosts };
        return app._router.handle(
          Object.assign(req, { url: '/api/schedule/bulk', originalUrl: '/api/schedule/bulk' }),
          res,
          () => {}
        );
      }
    }

    // If content string is provided (single post)
    if (content && typeof content === 'string') {
      const response = await makeHfRequest(HF_SCHEDULE_ENDPOINT, JSON.stringify({ text: content }));

      if (response && (response.statusCode === 200 || response.statusCode === 201)) {
        return res.status(200).json({
          success: true,
          message: 'Post scheduled successfully',
          preview: content.substring(0, 100)
        });
      }

      return res.status(response?.statusCode || 500).json({
        success: false,
        message: response?.message || 'Failed to schedule post'
      });
    }

    // If Google Doc URL is provided, acknowledge receipt
    // (N8N workflow should parse the doc and send posts separately)
    if (url) {
      return res.status(200).json({
        success: true,
        message: 'Google Doc URL received. Use /api/schedule/bulk to send parsed posts.',
        receivedUrl: url,
        hint: 'Parse the Google Doc content in your N8N workflow and POST the extracted posts to /api/schedule/bulk'
      });
    }

    return res.status(400).json({
      success: false,
      message: 'Invalid request. Expected: posts[], items[], content (string), or url (Google Doc)',
      example: {
        posts: [
          { text: 'First post content', scheduledTime: '2024-12-15T10:00:00Z' },
          { text: 'Second post content' }
        ]
      }
    });
  } catch (error) {
    console.error('N8N webhook error:', error);
    return res.status(500).json({
      success: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`
    });
  }
});

// Get API info
app.get('/api/info', (_req: Request, res: Response) => {
  res.json({
    name: 'Hypefury Scheduler API',
    version: '1.1.0',
    description: 'Schedule social media posts via Hypefury. Supports single posts, bulk scheduling, and N8N integration.',
    endpoints: [
      { method: 'GET', path: '/health', description: 'Health check' },
      { method: 'POST', path: '/api/auth', description: 'Authenticate with Hypefury' },
      {
        method: 'POST',
        path: '/api/schedule',
        description: 'Schedule a single post',
        body: {
          message: 'string (or "text")',
          scheduledTime: 'string (optional, ISO 8601 datetime)'
        }
      },
      {
        method: 'POST',
        path: '/api/schedule/bulk',
        description: 'Schedule multiple posts at once',
        body: {
          posts: [
            { message: 'string', scheduledTime: 'string (optional)' }
          ]
        }
      },
      {
        method: 'POST',
        path: '/webhook/schedule-content',
        description: 'N8N webhook endpoint - accepts posts, items, content, or URL'
      },
      { method: 'GET', path: '/api/info', description: 'API information' }
    ]
  });
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found. Visit /api/info for available endpoints.'
  });
});

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`Hypefury Scheduler API running on port ${PORT}`);
  console.log(`========================================\n`);
  console.log(`Endpoints:`);
  console.log(`  Health check:    http://localhost:${PORT}/health`);
  console.log(`  API info:        http://localhost:${PORT}/api/info`);
  console.log(`  Auth:            POST http://localhost:${PORT}/api/auth`);
  console.log(`  Schedule post:   POST http://localhost:${PORT}/api/schedule`);
  console.log(`  Bulk schedule:   POST http://localhost:${PORT}/api/schedule/bulk`);
  console.log(`  N8N webhook:     POST http://localhost:${PORT}/webhook/schedule-content`);
  console.log(`\nFor N8N integration, configure your webhook to POST to:`);
  console.log(`  http://YOUR_SERVER:${PORT}/webhook/schedule-content`);
  console.log(`\n`);
});

export default app;
