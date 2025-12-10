import express, { Request, Response } from 'express';
import { makeHfRequest, HF_AUTH_ENDPOINT, HF_SCHEDULE_ENDPOINT } from './utils.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'hypefury-scheduler' });
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

// Schedule post endpoint
app.post('/api/schedule', async (req: Request, res: Response) => {
  try {
    const { message, text } = req.body;
    const postContent = message || text;

    if (!postContent) {
      return res.status(400).json({
        success: false,
        message: 'Message content is required. Provide "message" or "text" in the request body.'
      });
    }

    const postData = {
      text: postContent
    };

    const response = await makeHfRequest(HF_SCHEDULE_ENDPOINT, JSON.stringify(postData));

    if (!response) {
      return res.status(500).json({
        success: false,
        message: 'Unable to schedule post.'
      });
    }

    if (response.statusCode === 200 || response.statusCode === 201) {
      return res.status(200).json({
        success: true,
        message: 'Post scheduled successfully.',
        data: response.message ? JSON.parse(response.message) : null
      });
    }

    return res.status(response.statusCode || 500).json({
      success: false,
      message: response.message || 'Failed to schedule post'
    });
  } catch (error) {
    console.error('Schedule error:', error);
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
    version: '1.0.0',
    endpoints: [
      { method: 'GET', path: '/health', description: 'Health check' },
      { method: 'POST', path: '/api/auth', description: 'Authenticate with Hypefury' },
      { method: 'POST', path: '/api/schedule', description: 'Schedule a post', body: { message: 'string' } },
      { method: 'GET', path: '/api/info', description: 'API information' }
    ]
  });
});

app.listen(PORT, () => {
  console.log(`Hypefury Scheduler API running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`API info: http://localhost:${PORT}/api/info`);
});

export default app;
