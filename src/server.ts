import express, { Request, Response, NextFunction } from 'express';
import { makeHfRequest, HF_AUTH_ENDPOINT, HF_SCHEDULE_ENDPOINT } from './utils.js';
import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import {
  initializeDatabase,
  getAllClients,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
  maskApiKey,
  type Client,
  type ClientSafe
} from './db/database.js';

// Quality pipeline imports
import {
  runQualityPipeline,
  parseDocumentIntoRawChunks,
  type PipelineResult
} from './pipeline/index.js';

// Operations database imports
import {
  initializeOperationsDb,
  createOperation,
  updateOperationTotal,
  completeOperation,
  failOperation,
  getRecentOperations,
  createPostRecord,
  markPostSent,
  markPostPermanentlyFailed,
  getSystemHealth,
  getPostsByOperation,
  getRecentPostLogs,
  getFailedPosts
} from './db/operations.js';

// Queue imports (retry queue status only - auto-retry disabled)
import { getRetryQueueStatus } from './queue/retryQueue.js';

// Dashboard imports
import { getDashboardHTML } from './dashboard/templates.js';

dotenv.config();

// Initialize databases
initializeDatabase();
initializeOperationsDb();

// Note: Auto-retry worker disabled - failures are logged but not automatically retried

// Google Doc URL parsing
function extractGoogleDocId(url: string): string | null {
  // Matches URLs like:
  // https://docs.google.com/document/d/DOCUMENT_ID/edit
  // https://docs.google.com/document/d/DOCUMENT_ID/view
  // https://docs.google.com/document/d/DOCUMENT_ID
  const patterns = [
    /docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/,
    /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

async function fetchGoogleDocContent(docId: string): Promise<string> {
  // Export Google Doc as plain text (works for publicly shared docs)
  const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;

  console.log(`Fetching Google Doc: ${exportUrl}`);

  const response = await fetch(exportUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    }
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Google Doc not found. Make sure the document exists and is publicly shared.');
    }
    if (response.status === 403 || response.status === 401) {
      throw new Error('Cannot access Google Doc. Make sure the document is publicly shared (Anyone with the link can view).');
    }
    throw new Error(`Failed to fetch Google Doc: HTTP ${response.status}`);
  }

  const text = await response.text();

  if (!text || text.trim().length === 0) {
    throw new Error('Google Doc is empty or could not be read.');
  }

  return text;
}

function formatPost(post: string): string {
  // Split into lines for processing
  let lines = post.split('\n');
  let result: string[] = [];
  let inList = false;
  let lastWasBlank = false;
  let lastWasText = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Check if this line is a list item (bullet or numbered)
    const isListItem = /^[\s]*[•\*\-✓✗xX→][\s]/.test(line) || /^[\s]*\d+[.\)]\s/.test(line);

    // Remove indentation from list items - make flush left
    if (isListItem) {
      line = line.replace(/^[\s]+/, '');
    }

    const isBlank = line.trim() === '';

    if (isBlank) {
      // Only add one blank line, skip consecutive blanks
      if (!lastWasBlank) {
        result.push('');
        lastWasBlank = true;
      }
      continue;
    }

    // For list items
    if (isListItem) {
      if (!inList && result.length > 0 && !lastWasBlank) {
        // Add one blank line before first list item
        result.push('');
      }
      inList = true;
      lastWasText = false;
      // NO blank lines between list items - just add the line
      result.push(line);
      lastWasBlank = false;
    } else {
      // Regular text - add blank line before if coming from list or previous text
      if (inList && !lastWasBlank) {
        result.push('');
        inList = false;
      } else if (lastWasText && !lastWasBlank) {
        // Add blank line between consecutive text paragraphs
        result.push('');
      }
      lastWasText = true;
      result.push(line);
      lastWasBlank = false;
    }
  }

  return result.join('\n').trim();
}

function parseDocumentIntoPosts(content: string): string[] {
  // Normalize line endings
  let text = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

  // Split by post delimiters:
  // 1. Underscores (___) on a line - separates days
  // 2. Em dash (—) on its own line - separates posts within a day
  let chunks = text.split(/^[_]{3,}$/m); // First split by day separators
  let allPosts: string[] = [];

  for (const chunk of chunks) {
    // Then split each day by em dash
    const dayPosts = chunk.split(/^—$/m);
    allPosts.push(...dayPosts);
  }

  return allPosts
    .map(p => {
      let post = p.trim();

      // Remove "Day X" headers at the start
      post = post.replace(/^Day\s*\d+:?\s*\n*/i, '');

      // Convert * bullets to •
      post = post.replace(/^\* /gm, '• ');

      // Apply proper formatting
      post = formatPost(post);

      return post.trim();
    })
    .filter(p => p.length >= 10)
    .filter(p => /[a-zA-Z]/.test(p));
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Serve static files from public directory
// In development, __dirname is src/, in production it's build/
const publicPath = path.join(__dirname, 'public');
if (fs.existsSync(publicPath)) {
  // Serve assets from public/assets directory
  app.use('/assets', express.static(path.join(publicPath, 'assets')));
} else {
  // Fallback to root public directory for development
  const rootPublicPath = path.join(__dirname, '..', 'public');
  app.use('/assets', express.static(path.join(rootPublicPath, 'assets')));
}

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

// Client management schemas
const CreateClientSchema = z.object({
  name: z.string().min(1, 'Client name is required').max(100, 'Client name must be 100 characters or less'),
  apiKey: z.string().min(1, 'API key is required')
});

const UpdateClientSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  apiKey: z.string().min(1).optional()
}).refine(data => data.name || data.apiKey, {
  message: 'At least one field (name or apiKey) is required'
});

// ============================================
// CLIENT MANAGEMENT API ENDPOINTS
// ============================================

// List all clients (safe - no API keys exposed)
app.get('/api/clients', (_req: Request, res: Response) => {
  try {
    const clients = getAllClients();
    return res.json({
      success: true,
      clients
    });
  } catch (error) {
    console.error('Error listing clients:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to list clients'
    });
  }
});

// Get single client by ID (with masked API key)
app.get('/api/clients/:id', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid client ID'
      });
    }

    const client = getClientById(id);
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    return res.json({
      success: true,
      client: {
        id: client.id,
        name: client.name,
        apiKeyMasked: maskApiKey(client.api_key),
        created_at: client.created_at,
        updated_at: client.updated_at
      }
    });
  } catch (error) {
    console.error('Error getting client:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to get client'
    });
  }
});

// Create new client
app.post('/api/clients', (req: Request, res: Response) => {
  try {
    const validation = CreateClientSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: validation.error.errors[0]?.message || 'Invalid request',
        errors: validation.error.errors
      });
    }

    const { name, apiKey } = validation.data;
    const client = createClient(name, apiKey);

    return res.status(201).json({
      success: true,
      message: `Client "${client.name}" created successfully`,
      client: {
        id: client.id,
        name: client.name,
        created_at: client.created_at
      }
    });
  } catch (error) {
    console.error('Error creating client:', error);
    const message = error instanceof Error ? error.message : 'Failed to create client';
    const status = message.includes('already exists') ? 409 : 500;
    return res.status(status).json({
      success: false,
      message
    });
  }
});

// Update existing client
app.put('/api/clients/:id', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid client ID'
      });
    }

    const validation = UpdateClientSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: validation.error.errors[0]?.message || 'Invalid request',
        errors: validation.error.errors
      });
    }

    const { name, apiKey } = validation.data;
    const client = updateClient(id, name, apiKey);

    return res.json({
      success: true,
      message: `Client "${client.name}" updated successfully`,
      client: {
        id: client.id,
        name: client.name,
        apiKeyMasked: maskApiKey(client.api_key),
        updated_at: client.updated_at
      }
    });
  } catch (error) {
    console.error('Error updating client:', error);
    const message = error instanceof Error ? error.message : 'Failed to update client';
    const status = message.includes('not found') ? 404 :
                   message.includes('already exists') ? 409 : 500;
    return res.status(status).json({
      success: false,
      message
    });
  }
});

// Delete client
app.delete('/api/clients/:id', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid client ID'
      });
    }

    const client = getClientById(id);
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    deleteClient(id);

    return res.json({
      success: true,
      message: `Client "${client.name}" deleted successfully`
    });
  } catch (error) {
    console.error('Error deleting client:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to delete client'
    });
  }
});

// Validate client's API key with Hypefury
app.post('/api/clients/:id/validate', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid client ID'
      });
    }

    const client = getClientById(id);
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Test the API key with Hypefury auth endpoint
    const response = await makeHfRequest(HF_AUTH_ENDPOINT, undefined, client.api_key);

    if (response.statusCode === 200 || response.statusCode === 409) {
      return res.json({
        success: true,
        message: `API key for "${client.name}" is valid`,
        valid: true
      });
    } else if (response.statusCode === 403) {
      return res.json({
        success: true,
        message: `API key for "${client.name}" is invalid or expired`,
        valid: false
      });
    }

    return res.json({
      success: true,
      message: `Unable to verify API key (HTTP ${response.statusCode})`,
      valid: null
    });
  } catch (error) {
    console.error('Error validating client API key:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to validate API key'
    });
  }
});

// ============================================
// MAIN UI - Simple scheduler page
// ============================================

// Serve the scheduler form at root
app.get('/', (_req: Request, res: Response) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
    <title>Hypefury Scheduler - The Birdhouse</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        * { box-sizing: border-box; }
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background: #E8F4F8;
            min-height: 100vh;
        }
        .logo {
            text-align: center;
            margin-bottom: 30px;
        }
        .logo img {
            height: 40px;
            width: auto;
        }
        .container {
            background: white;
            padding: 40px;
            border-radius: 16px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.08);
        }
        h1 { 
            font-family: 'Inter', sans-serif;
            color: #1a1a2e; 
            margin-bottom: 8px; 
            font-size: 32px; 
            font-weight: 400;
            text-align: center;
        }
        .subtitle { 
            color: #666; 
            margin-bottom: 30px; 
            font-size: 15px; 
            text-align: center;
        }
        label { 
            display: block; 
            margin-bottom: 8px; 
            font-weight: 500; 
            color: #1a1a2e; 
            font-size: 14px; 
        }
        input, select {
            width: 100%;
            padding: 14px;
            font-size: 16px;
            border: 1px solid #ddd;
            border-radius: 10px;
            margin-bottom: 15px;
            font-family: 'Inter', sans-serif;
            transition: border-color 0.2s;
        }
        input:focus, select:focus {
            outline: none;
            border-color: #4A90E2;
            box-shadow: 0 0 0 3px rgba(74, 144, 226, 0.1);
        }
        button {
            padding: 16px 24px;
            font-size: 16px;
            font-weight: 600;
            background: #4A90E2;
            color: white;
            border: none;
            border-radius: 10px;
            cursor: pointer;
            width: 100%;
            margin-bottom: 12px;
            font-family: 'Inter', sans-serif;
            transition: background-color 0.2s, transform 0.1s;
        }
        button:hover { 
            background: #3a7bc8; 
            transform: translateY(-1px);
        }
        button:active {
            transform: translateY(0);
        }
        button:disabled { 
            background: #ccc; 
            cursor: not-allowed;
            transform: none;
        }
        .btn-secondary {
            background: #5B9BD5;
        }
        .btn-secondary:hover { 
            background: #4a8bc4; 
        }
        .help-text { 
            font-size: 12px; 
            color: #888; 
            margin-top: -10px; 
            margin-bottom: 15px; 
        }
        #result {
            margin-top: 15px;
            padding: 16px;
            border-radius: 10px;
            font-size: 14px;
            display: none;
        }
        #result.show { display: block; }
        #result.success { 
            background: #d4edda; 
            color: #155724; 
            border: 1px solid #c3e6cb;
        }
        #result.error { 
            background: #f8d7da; 
            color: #721c24; 
            border: 1px solid #f5c6cb;
        }
        #result.info { 
            background: #e7f3ff; 
            color: #004085; 
            border: 1px solid #b8daff;
        }
        .no-clients {
            text-align: center;
            padding: 24px;
            background: #fff9e6;
            border-radius: 10px;
            margin-bottom: 20px;
            border: 1px solid #ffeaa7;
        }
        .no-clients p { 
            margin: 0 0 10px; 
            color: #856404; 
        }
    </style>
</head>
<body>
    <div class="logo">
        <img src="/assets/67b28401d861c78220c0803f_Layer_1 (1) (1).svg" alt="The Birdhouse">
    </div>
    <div class="container">
        <h1>Hypefury Scheduler</h1>
        <p class="subtitle">Import posts from Google Docs to Hypefury</p>

        <!-- No Clients Warning (shown when no clients exist) -->
        <div id="noClientsWarning" class="no-clients" style="display:none;">
            <p><strong>No clients set up yet!</strong></p>
            <p>Add your first client to get started.</p>
        </div>

        <!-- Client Selection -->
        <label for="clientSelect">Select Client</label>
        <select id="clientSelect">
            <option value="">Loading clients...</option>
        </select>

        <!-- Big Edit Clients Button -->
        <button class="btn-secondary" onclick="window.location.href='/clients'">
            Edit Clients
        </button>

        <!-- Google Doc URL -->
        <label for="docUrl">Google Doc URL</label>
        <input type="url" id="docUrl" placeholder="https://docs.google.com/document/d/...">
        <p class="help-text">Doc must be shared as "Anyone with the link can view"</p>

        <button onclick="submitGoogleDoc()" id="submitBtn">Import & Schedule Posts</button>

        <div id="result"></div>
    </div>

    <script>
        let selectedClientId = null;
        let clients = [];

        // Load clients on page load
        document.addEventListener('DOMContentLoaded', loadClients);

        // Refresh clients when user comes back to this tab/page
        document.addEventListener('visibilitychange', function() {
            if (document.visibilityState === 'visible') {
                loadClients();
            }
        });

        // Also refresh on window focus (backup for older browsers)
        window.addEventListener('focus', loadClients);

        async function loadClients() {
            try {
                const response = await fetch('/api/clients');
                const data = await response.json();
                if (data.success) {
                    clients = data.clients;

                    // Reset selection if current client no longer exists
                    if (selectedClientId && !clients.find(c => c.id === selectedClientId)) {
                        selectedClientId = null;
                    }

                    updateDropdown();
                }
            } catch (error) {
                console.error('Error loading clients:', error);
            }
        }

        function updateDropdown() {
            const select = document.getElementById('clientSelect');
            const warning = document.getElementById('noClientsWarning');

            if (clients.length === 0) {
                select.innerHTML = '<option value="">No clients - click Edit Clients to add one</option>';
                warning.style.display = 'block';
                selectedClientId = null;
            } else {
                select.innerHTML = '<option value="">Choose a client...</option>';
                clients.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c.id;
                    opt.textContent = c.name;
                    // Preserve selection if still valid
                    if (selectedClientId === c.id) {
                        opt.selected = true;
                    }
                    select.appendChild(opt);
                });
                warning.style.display = 'none';

                // If selection was invalid, reset dropdown to "Choose a client..."
                if (!selectedClientId) {
                    select.value = '';
                }
            }
        }

        // Dropdown change handler
        document.getElementById('clientSelect').addEventListener('change', function() {
            selectedClientId = this.value ? parseInt(this.value) : null;
        });

        // Submit Google Doc
        async function submitGoogleDoc() {
            const result = document.getElementById('result');
            const btn = document.getElementById('submitBtn');

            if (!selectedClientId) {
                result.textContent = 'Please select a client first';
                result.className = 'show error';
                return;
            }

            const docUrl = document.getElementById('docUrl').value.trim();
            if (!docUrl) {
                result.textContent = 'Please enter a Google Doc URL';
                result.className = 'show error';
                return;
            }

            if (!docUrl.includes('docs.google.com/document')) {
                result.textContent = 'Please enter a valid Google Docs URL';
                result.className = 'show error';
                return;
            }

            btn.disabled = true;
            btn.textContent = 'Importing...';
            const clientName = clients.find(c => c.id === selectedClientId)?.name || '';
            result.textContent = 'Importing posts for ' + clientName + '...';
            result.className = 'show info';

            try {
                const resp = await fetch('/api/schedule/google-doc', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: docUrl, clientId: selectedClientId })
                });
                const data = await resp.json();

                if (data.success) {
                    result.textContent = data.message;
                    result.className = 'show success';
                    document.getElementById('docUrl').value = '';
                } else {
                    result.textContent = data.message || 'Unknown error';
                    result.className = 'show error';
                }
            } catch (e) {
                result.textContent = e.message;
                result.className = 'show error';
            } finally {
                btn.disabled = false;
                btn.textContent = 'Import & Schedule Posts';
            }
        }

        // Enter to submit
        document.getElementById('docUrl').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') submitGoogleDoc();
        });
    </script>
</body>
</html>`);
});

// ============================================
// CLIENT MANAGEMENT PAGE - Separate page
// ============================================

app.get('/clients', (_req: Request, res: Response) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
    <title>Manage Clients - The Birdhouse</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        * { box-sizing: border-box; }
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            max-width: 700px;
            margin: 0 auto;
            padding: 20px;
            background: #E8F4F8;
            min-height: 100vh;
        }
        .logo {
            text-align: center;
            margin-bottom: 30px;
        }
        .logo img {
            height: 40px;
            width: auto;
        }
        .container {
            background: white;
            padding: 40px;
            border-radius: 16px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.08);
        }
        h1 { 
            font-family: 'Inter', sans-serif;
            color: #1a1a2e; 
            margin-bottom: 8px; 
            font-size: 32px; 
            font-weight: 400;
            text-align: center;
        }
        .subtitle { 
            color: #666; 
            margin-bottom: 30px; 
            font-size: 15px; 
            text-align: center;
        }
        label { 
            display: block; 
            margin-bottom: 8px; 
            font-weight: 500; 
            color: #1a1a2e; 
            font-size: 14px; 
        }
        input {
            width: 100%;
            padding: 14px;
            font-size: 16px;
            border: 1px solid #ddd;
            border-radius: 10px;
            margin-bottom: 12px;
            font-family: 'Inter', sans-serif;
            transition: border-color 0.2s;
        }
        input:focus {
            outline: none;
            border-color: #4A90E2;
            box-shadow: 0 0 0 3px rgba(74, 144, 226, 0.1);
        }
        button {
            padding: 16px 24px;
            font-size: 16px;
            font-weight: 600;
            background: #4A90E2;
            color: white;
            border: none;
            border-radius: 10px;
            cursor: pointer;
            font-family: 'Inter', sans-serif;
            transition: background-color 0.2s, transform 0.1s;
        }
        button:hover { 
            background: #3a7bc8; 
            transform: translateY(-1px);
        }
        button:active {
            transform: translateY(0);
        }
        button:disabled { 
            background: #ccc; 
            cursor: not-allowed;
            transform: none;
        }
        .btn-back {
            background: #6c757d;
            width: 100%;
            margin-bottom: 25px;
        }
        .btn-back:hover { 
            background: #5a6268; 
        }
        .btn-add {
            width: 100%;
            margin-bottom: 20px;
        }
        .btn-delete {
            background: #dc3545;
            padding: 10px 20px;
            font-size: 14px;
        }
        .btn-delete:hover { 
            background: #c82333; 
        }
        .btn-test {
            background: #5B9BD5;
            padding: 10px 20px;
            font-size: 14px;
            margin-right: 8px;
        }
        .btn-test:hover { 
            background: #4a8bc4; 
        }
        .btn-test.valid { 
            background: #28a745; 
        }
        .btn-test.invalid { 
            background: #dc3545; 
        }
        .help-text { 
            font-size: 12px; 
            color: #888; 
            margin-top: -8px; 
            margin-bottom: 15px; 
        }

        /* Add Client Section */
        .add-section {
            background: #f8f9fa;
            padding: 24px;
            border-radius: 12px;
            margin-bottom: 30px;
        }
        .add-section h2 {
            font-family: 'Inter', sans-serif;
            font-size: 22px;
            margin: 0 0 20px;
            color: #1a1a2e;
            font-weight: 400;
        }

        /* Client List */
        .client-list h2 {
            font-family: 'Inter', sans-serif;
            font-size: 22px;
            margin: 0 0 20px;
            color: #1a1a2e;
            font-weight: 400;
        }
        .client-card {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 18px 20px;
            background: #f8f9fa;
            border-radius: 12px;
            margin-bottom: 12px;
            transition: box-shadow 0.2s;
        }
        .client-card:hover {
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .client-card:last-child { 
            margin-bottom: 0; 
        }
        .client-name {
            font-weight: 600;
            font-size: 16px;
            color: #1a1a2e;
        }
        .client-key {
            font-size: 12px;
            color: #888;
            margin-top: 6px;
        }
        .no-clients {
            text-align: center;
            padding: 40px;
            color: #888;
        }

        /* Message */
        .message {
            padding: 14px 18px;
            border-radius: 10px;
            margin-bottom: 20px;
            font-size: 14px;
            display: none;
        }
        .message.show { 
            display: block; 
        }
        .message.success { 
            background: #d4edda; 
            color: #155724; 
            border: 1px solid #c3e6cb;
        }
        .message.error { 
            background: #f8d7da; 
            color: #721c24; 
            border: 1px solid #f5c6cb;
        }
    </style>
</head>
<body>
    <div class="logo">
        <img src="/assets/67b28401d861c78220c0803f_Layer_1 (1) (1).svg" alt="The Birdhouse">
    </div>
    <div class="container">
        <button class="btn-back" onclick="window.location.href='/'">
            ← Back to Scheduler
        </button>

        <h1>Manage Clients</h1>
        <p class="subtitle">Add, edit, or remove client accounts</p>

        <div id="message" class="message"></div>

        <!-- Add New Client Section -->
        <div class="add-section">
            <h2>Add New Client</h2>
            <label for="clientName">Client Name</label>
            <input type="text" id="clientName" placeholder="e.g. Acme Corp">

            <label for="apiKey">Hypefury API Key</label>
            <input type="text" id="apiKey" placeholder="Paste API key here">
            <p class="help-text">Find it: Hypefury → Settings → Connections → External Apps → Generate API key</p>

            <button class="btn-add" onclick="addClient()">Add Client</button>
        </div>

        <!-- Existing Clients -->
        <div class="client-list">
            <h2>Your Clients</h2>
            <div id="clientsContainer">
                <div class="no-clients">Loading...</div>
            </div>
        </div>
    </div>

    <script>
        let clients = [];

        // Load clients on page load
        document.addEventListener('DOMContentLoaded', loadClients);

        async function loadClients() {
            try {
                const response = await fetch('/api/clients');
                const data = await response.json();
                if (data.success) {
                    clients = data.clients;
                    renderClients();
                }
            } catch (error) {
                console.error('Error loading clients:', error);
                showMessage('Failed to load clients', 'error');
            }
        }

        function renderClients() {
            const container = document.getElementById('clientsContainer');

            if (clients.length === 0) {
                container.innerHTML = '<div class="no-clients">No clients yet. Add your first client above!</div>';
                return;
            }

            container.innerHTML = clients.map(c => \`
                <div class="client-card">
                    <div>
                        <div class="client-name">\${esc(c.name)}</div>
                        <div class="client-key">API Key: \${c.apiKeyMasked || '••••••••'}</div>
                    </div>
                    <div>
                        <button class="btn-test" id="test-btn-\${c.id}" onclick="testClient(\${c.id})">Test</button>
                        <button class="btn-delete" onclick="deleteClient(\${c.id}, '\${esc(c.name)}')">Delete</button>
                    </div>
                </div>
            \`).join('');
        }

        function esc(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function showMessage(text, type) {
            const msg = document.getElementById('message');
            msg.textContent = text;
            msg.className = 'message show ' + type;
            setTimeout(() => msg.className = 'message', 4000);
        }

        async function addClient() {
            const name = document.getElementById('clientName').value.trim();
            const apiKey = document.getElementById('apiKey').value.trim();

            if (!name) {
                showMessage('Please enter a client name', 'error');
                return;
            }
            if (!apiKey) {
                showMessage('Please enter an API key', 'error');
                return;
            }

            try {
                const resp = await fetch('/api/clients', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, apiKey })
                });
                const data = await resp.json();

                if (data.success) {
                    document.getElementById('clientName').value = '';
                    document.getElementById('apiKey').value = '';
                    showMessage('Client "' + name + '" added successfully!', 'success');
                    await loadClients();
                } else {
                    showMessage(data.message || 'Failed to add client', 'error');
                }
            } catch (e) {
                showMessage('Error: ' + e.message, 'error');
            }
        }

        async function testClient(id) {
            const btn = document.getElementById('test-btn-' + id);
            const originalText = btn.textContent;
            btn.textContent = 'Testing...';
            btn.disabled = true;

            try {
                const resp = await fetch('/api/clients/' + id + '/validate', { method: 'POST' });
                const data = await resp.json();

                if (data.valid === true) {
                    btn.textContent = '✓ Valid';
                    btn.className = 'btn-test valid';
                    showMessage('API key is valid! Ready to schedule posts.', 'success');
                } else if (data.valid === false) {
                    btn.textContent = '✗ Invalid';
                    btn.className = 'btn-test invalid';
                    showMessage('API key is INVALID. Please check: Hypefury → Settings → External Apps → Generate new key', 'error');
                } else {
                    btn.textContent = '? Unknown';
                    showMessage('Could not verify API key: ' + (data.message || 'Unknown error'), 'error');
                }
            } catch (e) {
                btn.textContent = 'Error';
                showMessage('Test failed: ' + e.message, 'error');
            }

            btn.disabled = false;
            setTimeout(() => {
                btn.textContent = 'Test';
                btn.className = 'btn-test';
            }, 5000);
        }

        async function deleteClient(id, name) {
            if (!confirm('Delete "' + name + '"?\\n\\nThis cannot be undone.')) {
                return;
            }

            try {
                const resp = await fetch('/api/clients/' + id, { method: 'DELETE' });
                const data = await resp.json();

                if (data.success) {
                    showMessage('Client "' + name + '" deleted', 'success');
                    await loadClients();
                } else {
                    showMessage(data.message || 'Failed to delete client', 'error');
                }
            } catch (e) {
                showMessage('Error: ' + e.message, 'error');
            }
        }

        // Enter to add
        document.getElementById('apiKey').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') addClient();
        });
    </script>
</body>
</html>`);
});

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'hypefury-scheduler',
    timestamp: new Date().toISOString()
  });
});

// ============================================
// DASHBOARD ROUTES
// ============================================

// Dashboard UI
app.get('/dashboard', (_req: Request, res: Response) => {
  res.send(getDashboardHTML());
});

// Dashboard API - System health
app.get('/api/dashboard/health', (_req: Request, res: Response) => {
  try {
    const health = getSystemHealth();
    return res.json({ success: true, health });
  } catch (error) {
    console.error('Error getting system health:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to get health'
    });
  }
});

// Dashboard API - Recent operations
app.get('/api/dashboard/operations', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const clientId = req.query.clientId ? parseInt(req.query.clientId as string) : undefined;
    const operations = getRecentOperations(limit, clientId);

    // Enrich operations with client names from the clients database
    const enrichedOperations = operations.map(op => {
      const client = getClientById(op.client_id);
      return {
        ...op,
        clientName: client?.name || `Client #${op.client_id}`
      };
    });

    return res.json({ success: true, operations: enrichedOperations });
  } catch (error) {
    console.error('Error getting operations:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to get operations'
    });
  }
});

// Dashboard API - Queue status
app.get('/api/dashboard/queue', (_req: Request, res: Response) => {
  try {
    const queueStatus = getRetryQueueStatus();
    return res.json({ success: true, queue: queueStatus });
  } catch (error) {
    console.error('Error getting queue status:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to get queue status'
    });
  }
});

// Dashboard API - Logs (recent posts with errors)
app.get('/api/dashboard/logs', (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const failedOnly = req.query.failed === 'true';

    const posts = failedOnly ? getFailedPosts(limit) : getRecentPostLogs(limit);

    // Enrich with client names
    const enrichedPosts = posts.map(post => {
      const client = getClientById(post.client_id);
      return {
        ...post,
        clientName: client?.name || `Client #${post.client_id}`,
        // Parse JSON fields for the frontend
        issuesParsed: JSON.parse(post.issues_detected || '[]'),
        correctionsParsed: JSON.parse(post.corrections_applied || '[]')
      };
    });

    return res.json({ success: true, logs: enrichedPosts });
  } catch (error) {
    console.error('Error getting logs:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to get logs'
    });
  }
});

// Dashboard API - Operation details with posts
app.get('/api/dashboard/operation/:id', (req: Request, res: Response) => {
  try {
    const operationId = parseInt(req.params.id, 10);
    if (isNaN(operationId)) {
      return res.status(400).json({ success: false, message: 'Invalid operation ID' });
    }
    const posts = getPostsByOperation(operationId);
    return res.json({ success: true, posts });
  } catch (error) {
    console.error('Error getting operation details:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to get operation details'
    });
  }
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
    const { clientId } = req.body;
    const postContent = message || text;
    const postTime = scheduledTime || time;

    // Get client API key if clientId provided
    let clientApiKey: string | undefined;
    if (clientId) {
      const client = getClientById(parseInt(clientId, 10));
      if (!client) {
        return res.status(404).json({
          success: false,
          message: 'Client not found. Please select a valid client.'
        });
      }
      clientApiKey = client.api_key;
      console.log(`Using API key for client: ${client.name}`);
    }

    const postData: Record<string, unknown> = {
      text: postContent
    };

    if (postTime) {
      postData.time = postTime;
    }

    console.log('Scheduling post:', postData);
    const response = await makeHfRequest(HF_SCHEDULE_ENDPOINT, JSON.stringify(postData), clientApiKey);

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
    const { clientId } = req.body;

    // Get client API key if clientId provided
    let clientApiKey: string | undefined;
    if (clientId) {
      const client = getClientById(parseInt(clientId, 10));
      if (!client) {
        return res.status(404).json({
          success: false,
          message: 'Client not found. Please select a valid client.'
        });
      }
      clientApiKey = client.api_key;
      console.log(`Using API key for client: ${client.name}`);
    }

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
      const response = await makeHfRequest(HF_SCHEDULE_ENDPOINT, JSON.stringify(postData), clientApiKey);

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

// Google Doc import endpoint - fetches, parses, and schedules posts from a Google Doc
// Now with quality pipeline integration for auto-correction and validation
app.post('/api/schedule/google-doc', async (req: Request, res: Response) => {
  // Create operation record for tracking
  const clientIdNum = req.body.clientId ? parseInt(req.body.clientId, 10) : 0;
  let operationId: number | null = null;

  try {
    const { url, clientId } = req.body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Google Doc URL is required'
      });
    }

    // Get client API key if clientId provided
    let clientApiKey: string | undefined;
    if (clientId) {
      const client = getClientById(parseInt(clientId, 10));
      if (!client) {
        return res.status(404).json({
          success: false,
          message: 'Client not found. Please select a valid client.'
        });
      }
      clientApiKey = client.api_key;
      console.log(`Using API key for client: ${client.name}`);
    }

    // Create operation record
    operationId = createOperation(clientIdNum, 'google_doc', url);
    console.log(`[Operation ${operationId}] Processing Google Doc URL:`, url);

    // Extract document ID from URL
    const docId = extractGoogleDocId(url);
    if (!docId) {
      if (operationId) failOperation(operationId, 'Invalid Google Doc URL');
      return res.status(400).json({
        success: false,
        message: 'Invalid Google Doc URL. Expected format: https://docs.google.com/document/d/YOUR_DOC_ID/...'
      });
    }

    console.log(`[Operation ${operationId}] Extracted document ID:`, docId);

    // Fetch the document content
    let content: string;
    try {
      content = await fetchGoogleDocContent(docId);
      console.log(`[Operation ${operationId}] Fetched document content, length:`, content.length);
    } catch (fetchError) {
      console.error(`[Operation ${operationId}] Error fetching Google Doc:`, fetchError);
      if (operationId) failOperation(operationId, fetchError instanceof Error ? fetchError.message : 'Failed to fetch');
      return res.status(400).json({
        success: false,
        message: fetchError instanceof Error ? fetchError.message : 'Failed to fetch Google Doc'
      });
    }

    // Parse content into raw chunks using the new pipeline parser
    const rawPosts = parseDocumentIntoRawChunks(content);
    console.log(`[Operation ${operationId}] Parsed ${rawPosts.length} raw chunks from document`);

    if (rawPosts.length === 0) {
      if (operationId) failOperation(operationId, 'No posts found in document');
      return res.status(400).json({
        success: false,
        message: 'No posts found in the Google Doc. Make sure posts are separated by em-dash (—) or underscore (___) lines.'
      });
    }

    // Update operation with total count
    updateOperationTotal(operationId, rawPosts.length);

    // Process each post through quality pipeline
    const results: Array<{
      index: number;
      success: boolean;
      message: string;
      preview: string;
      qualityScore?: number;
      corrections?: string[];
    }> = [];

    let successCount = 0;
    let failCount = 0;
    let correctedCount = 0;
    let rejectedCount = 0;

    for (let i = 0; i < rawPosts.length; i++) {
      const rawPost = rawPosts[i];

      // Run through quality pipeline
      const pipelineResult = runQualityPipeline(rawPost);
      console.log(`[Operation ${operationId}] Post ${i + 1}: Quality score ${pipelineResult.qualityScore}, valid: ${pipelineResult.isValid}, corrections: ${pipelineResult.corrections.length}`);

      // Create post record in database
      const postId = createPostRecord(operationId, clientIdNum, {
        originalContent: pipelineResult.originalContent,
        processedContent: pipelineResult.processedContent,
        qualityScore: pipelineResult.qualityScore,
        issues: pipelineResult.allIssues,
        corrections: pipelineResult.corrections,
        status: pipelineResult.isValid ? 'queued' : 'rejected'
      });

      // Track if corrections were applied
      if (pipelineResult.corrections.length > 0) {
        correctedCount++;
      }

      // Check if post was rejected by quality gate
      if (!pipelineResult.isValid) {
        rejectedCount++;
        results.push({
          index: i,
          success: false,
          message: `Quality check failed: ${pipelineResult.rejectionReason || 'Did not meet quality standards'}`,
          preview: rawPost.substring(0, 50) + (rawPost.length > 50 ? '...' : ''),
          qualityScore: pipelineResult.qualityScore
        });
        continue;
      }

      // Send to Hypefury
      const postData = { text: pipelineResult.processedContent };
      console.log(`[Operation ${operationId}] Scheduling post ${i + 1}/${rawPosts.length}`);
      const response = await makeHfRequest(HF_SCHEDULE_ENDPOINT, JSON.stringify(postData), clientApiKey);

      if (response && (response.statusCode === 200 || response.statusCode === 201)) {
        successCount++;
        markPostSent(postId, response.message || 'Success');
        results.push({
          index: i,
          success: true,
          message: pipelineResult.corrections.length > 0
            ? `Added to queue (auto-corrected: ${pipelineResult.corrections.join(', ')})`
            : 'Added to queue',
          preview: pipelineResult.processedContent.substring(0, 50) + (pipelineResult.processedContent.length > 50 ? '...' : ''),
          qualityScore: pipelineResult.qualityScore,
          corrections: pipelineResult.corrections.length > 0 ? pipelineResult.corrections : undefined
        });
      } else {
        failCount++;
        // Mark as failed (no auto-retry)
        const errorMsg = response?.message || `HTTP ${response?.statusCode || 'Unknown'}`;
        markPostPermanentlyFailed(postId, errorMsg);
        results.push({
          index: i,
          success: false,
          message: `Failed: ${errorMsg}`,
          preview: pipelineResult.processedContent.substring(0, 50) + (pipelineResult.processedContent.length > 50 ? '...' : ''),
          qualityScore: pipelineResult.qualityScore
        });
      }

      // Small delay between requests to avoid rate limiting
      if (i < rawPosts.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Complete operation record
    completeOperation(operationId, {
      successful: successCount,
      failed: failCount,
      corrected: correctedCount,
      rejected: rejectedCount
    });

    // Determine overall success
    const allSuccess = failCount === 0 && rejectedCount === 0;

    return res.status(200).json({
      success: allSuccess,
      message: `Processed ${rawPosts.length} posts: ${successCount} sent, ${failCount} queued for retry, ${rejectedCount} rejected`,
      summary: {
        total: rawPosts.length,
        success: successCount,
        failed: failCount,
        corrected: correctedCount,
        rejected: rejectedCount
      },
      results
    });
  } catch (error) {
    console.error('Google Doc import error:', error);
    if (operationId) failOperation(operationId, error instanceof Error ? error.message : String(error));
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
    const { posts, url, content, items, clientId } = req.body;

    // Get client API key if clientId provided
    let clientApiKey: string | undefined;
    if (clientId) {
      const client = getClientById(parseInt(clientId, 10));
      if (!client) {
        return res.status(404).json({
          success: false,
          message: 'Client not found. Please select a valid client.'
        });
      }
      clientApiKey = client.api_key;
      console.log(`Using API key for client: ${client.name}`);
    }

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

      // Reuse bulk schedule logic - pass clientId through
      req.body = { posts, clientId };
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
        req.body = { posts: formattedPosts, clientId };
        return app._router.handle(
          Object.assign(req, { url: '/api/schedule/bulk', originalUrl: '/api/schedule/bulk' }),
          res,
          () => {}
        );
      }
    }

    // If content string is provided (single post)
    if (content && typeof content === 'string') {
      const response = await makeHfRequest(HF_SCHEDULE_ENDPOINT, JSON.stringify({ text: content }), clientApiKey);

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
  console.log(`UI Pages:`);
  console.log(`  Scheduler:       http://localhost:${PORT}/`);
  console.log(`  Dashboard:       http://localhost:${PORT}/dashboard`);
  console.log(`  Clients:         http://localhost:${PORT}/clients`);
  console.log(`\nAPI Endpoints:`);
  console.log(`  Health check:    http://localhost:${PORT}/health`);
  console.log(`  API info:        http://localhost:${PORT}/api/info`);
  console.log(`  Schedule post:   POST http://localhost:${PORT}/api/schedule`);
  console.log(`  Bulk schedule:   POST http://localhost:${PORT}/api/schedule/bulk`);
  console.log(`  Google Doc:      POST http://localhost:${PORT}/api/schedule/google-doc`);
  console.log(`  N8N webhook:     POST http://localhost:${PORT}/webhook/schedule-content`);
  console.log(`\nQuality Pipeline: ACTIVE`);
  console.log(`Auto-Retry: DISABLED (failures logged for manual review)`);
  console.log(`\n`);
});

export default app;
