import express, { Request, Response, NextFunction } from 'express';
import { makeHfRequest, HF_AUTH_ENDPOINT, HF_SCHEDULE_ENDPOINT } from './utils.js';
import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
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

dotenv.config();

// Initialize the database
initializeDatabase();

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

function parseDocumentIntoPosts(content: string): string[] {
  // Split by double newlines (paragraphs) or horizontal rules
  // Also handle Windows-style line endings
  const normalizedContent = content.replace(/\r\n/g, '\n');

  // Split by double newlines or more
  const posts = normalizedContent
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0)
    // Filter out very short content that's likely not a real post
    .filter(p => p.length >= 5);

  return posts;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
// MAIN UI
// ============================================

// Serve the scheduler form at root
app.get('/', (_req: Request, res: Response) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
    <title>Hypefury Scheduler</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        * { box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            max-width: 500px;
            margin: 0 auto;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 12px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 { color: #333; margin-bottom: 5px; font-size: 24px; }
        .subtitle { color: #666; margin-bottom: 25px; font-size: 14px; }
        label { display: block; margin-bottom: 6px; font-weight: 500; color: #444; font-size: 14px; }
        input, select {
            width: 100%;
            padding: 12px;
            font-size: 16px;
            border: 1px solid #ddd;
            border-radius: 8px;
        }
        input:focus, select:focus {
            outline: none;
            border-color: #4CAF50;
        }
        button {
            padding: 14px 24px;
            font-size: 15px;
            font-weight: 600;
            background: #4CAF50;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            width: 100%;
        }
        button:hover { background: #45a049; }
        button:disabled { background: #ccc; cursor: not-allowed; }
        button.small {
            padding: 8px 16px;
            font-size: 13px;
            width: auto;
        }
        button.outline {
            background: white;
            color: #666;
            border: 1px solid #ddd;
        }
        button.outline:hover { background: #f9f9f9; }
        button.danger { background: #dc3545; }
        button.danger:hover { background: #c82333; }
        .help-text { font-size: 12px; color: #888; margin-top: 6px; }
        #result {
            margin-top: 20px;
            padding: 15px;
            border-radius: 8px;
            font-size: 14px;
            display: none;
        }
        #result.show { display: block; }
        #result.success { background: #d4edda; color: #155724; }
        #result.error { background: #f8d7da; color: #721c24; }
        #result.info { background: #e7f3ff; color: #004085; }

        /* Section spacing */
        .section { margin-bottom: 20px; }

        /* Client dropdown with edit link */
        .client-row {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 6px;
        }
        .client-row select { margin-bottom: 0; flex: 1; }
        .edit-link {
            font-size: 13px;
            color: #666;
            text-decoration: none;
            cursor: pointer;
            white-space: nowrap;
        }
        .edit-link:hover { color: #333; text-decoration: underline; }

        /* Add client inline form */
        .add-client-form {
            display: none;
            background: #f8f9fa;
            border-radius: 8px;
            padding: 15px;
            margin-top: 10px;
        }
        .add-client-form.show { display: block; }
        .add-client-form input { margin-bottom: 10px; }
        .add-client-form .btn-row {
            display: flex;
            gap: 10px;
        }
        .add-client-form .btn-row button { flex: 1; }

        /* Client list (edit mode) */
        .client-list {
            display: none;
            margin-top: 10px;
        }
        .client-list.show { display: block; }
        .client-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 12px;
            background: #f8f9fa;
            border-radius: 6px;
            margin-bottom: 8px;
        }
        .client-item:last-child { margin-bottom: 0; }
        .client-item-name { font-weight: 500; font-size: 14px; }
        .client-item-actions {
            display: flex;
            gap: 8px;
        }
        .client-item-actions button { padding: 6px 12px; font-size: 12px; }
        .done-editing {
            margin-top: 12px;
            text-align: center;
        }
        .done-editing a {
            font-size: 13px;
            color: #4CAF50;
            cursor: pointer;
            text-decoration: none;
        }
        .done-editing a:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Hypefury Scheduler</h1>
        <p class="subtitle">Import posts from Google Docs to Hypefury</p>

        <!-- Client Selection -->
        <div class="section">
            <label>Client</label>
            <div class="client-row">
                <select id="clientSelect">
                    <option value="">Choose a client...</option>
                </select>
                <a class="edit-link" onclick="toggleEditMode()">edit</a>
            </div>

            <!-- Inline Add Client Form -->
            <div id="addClientForm" class="add-client-form">
                <input type="text" id="newClientName" placeholder="Client name (e.g. Acme Corp)">
                <input type="text" id="newClientKey" placeholder="Hypefury API key">
                <div class="btn-row">
                    <button onclick="saveNewClient()">Save Client</button>
                    <button class="outline" onclick="cancelAddClient()">Cancel</button>
                </div>
                <p class="help-text" style="margin-top: 10px;">Find API key: Hypefury → Settings → Integrations → API Access</p>
            </div>

            <!-- Client List (Edit Mode) -->
            <div id="clientList" class="client-list"></div>
        </div>

        <!-- Google Doc URL -->
        <div class="section">
            <label for="docUrl">Google Doc URL</label>
            <input type="url" id="docUrl" placeholder="https://docs.google.com/document/d/...">
            <p class="help-text">Doc must be shared as "Anyone with the link can view"</p>
        </div>

        <button onclick="submitGoogleDoc()" id="submitBtn">Import & Schedule Posts</button>

        <div id="result"></div>
    </div>

    <script>
        let selectedClientId = null;
        let clients = [];
        let editMode = false;

        // Load clients on page load
        document.addEventListener('DOMContentLoaded', loadClients);

        async function loadClients() {
            try {
                const response = await fetch('/api/clients');
                const data = await response.json();
                if (data.success) {
                    clients = data.clients;
                    updateDropdown();
                    updateClientList();
                }
            } catch (error) {
                console.error('Error loading clients:', error);
            }
        }

        function updateDropdown() {
            const select = document.getElementById('clientSelect');
            const currentValue = select.value;

            select.innerHTML = '<option value="">Choose a client...</option>';
            clients.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = c.name;
                select.appendChild(opt);
            });
            select.innerHTML += '<option value="__add__">+ Add new client</option>';

            if (currentValue && currentValue !== '__add__' && clients.some(c => c.id == currentValue)) {
                select.value = currentValue;
            }
        }

        function updateClientList() {
            const listEl = document.getElementById('clientList');
            if (clients.length === 0) {
                listEl.innerHTML = '<p style="color:#888;font-size:13px;">No clients yet</p>';
                return;
            }
            listEl.innerHTML = clients.map(c => \`
                <div class="client-item">
                    <span class="client-item-name">\${esc(c.name)}</span>
                    <div class="client-item-actions">
                        <button class="small outline" onclick="deleteClientConfirm(\${c.id}, '\${esc(c.name)}')">Delete</button>
                    </div>
                </div>
            \`).join('') + '<div class="done-editing"><a onclick="toggleEditMode()">Done editing</a></div>';
        }

        function esc(t) {
            const d = document.createElement('div');
            d.textContent = t;
            return d.innerHTML;
        }

        // Dropdown change handler
        document.getElementById('clientSelect').addEventListener('change', function() {
            if (this.value === '__add__') {
                this.value = '';
                showAddForm();
            } else {
                selectedClientId = this.value ? parseInt(this.value) : null;
                hideAddForm();
                hideEditMode();
            }
        });

        function showAddForm() {
            document.getElementById('addClientForm').classList.add('show');
            document.getElementById('newClientName').focus();
            hideEditMode();
        }

        function hideAddForm() {
            document.getElementById('addClientForm').classList.remove('show');
            document.getElementById('newClientName').value = '';
            document.getElementById('newClientKey').value = '';
        }

        function cancelAddClient() {
            hideAddForm();
        }

        async function saveNewClient() {
            const name = document.getElementById('newClientName').value.trim();
            const apiKey = document.getElementById('newClientKey').value.trim();
            const result = document.getElementById('result');

            if (!name || !apiKey) {
                result.textContent = 'Please enter both client name and API key';
                result.className = 'show error';
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
                    await loadClients();
                    hideAddForm();
                    // Auto-select the new client
                    document.getElementById('clientSelect').value = data.client.id;
                    selectedClientId = data.client.id;
                    result.textContent = 'Client "' + name + '" added!';
                    result.className = 'show success';
                    setTimeout(() => result.className = '', 3000);
                } else {
                    result.textContent = data.message;
                    result.className = 'show error';
                }
            } catch (e) {
                result.textContent = 'Error: ' + e.message;
                result.className = 'show error';
            }
        }

        function toggleEditMode() {
            editMode = !editMode;
            const list = document.getElementById('clientList');
            if (editMode) {
                list.classList.add('show');
                hideAddForm();
            } else {
                list.classList.remove('show');
            }
        }

        function hideEditMode() {
            editMode = false;
            document.getElementById('clientList').classList.remove('show');
        }

        function deleteClientConfirm(id, name) {
            if (confirm('Delete "' + name + '"? This cannot be undone.')) {
                deleteClient(id);
            }
        }

        async function deleteClient(id) {
            try {
                await fetch('/api/clients/' + id, { method: 'DELETE' });
                if (selectedClientId === id) {
                    selectedClientId = null;
                    document.getElementById('clientSelect').value = '';
                }
                await loadClients();
            } catch (e) {
                alert('Error: ' + e.message);
            }
        }

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
                    result.textContent = '✓ ' + data.message;
                    result.className = 'show success';
                    document.getElementById('docUrl').value = '';
                } else {
                    result.textContent = '✗ ' + (data.message || 'Unknown error');
                    result.className = 'show error';
                }
            } catch (e) {
                result.textContent = '✗ ' + e.message;
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
app.post('/api/schedule/google-doc', async (req: Request, res: Response) => {
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

    console.log('Processing Google Doc URL:', url);

    // Extract document ID from URL
    const docId = extractGoogleDocId(url);
    if (!docId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Google Doc URL. Expected format: https://docs.google.com/document/d/YOUR_DOC_ID/...'
      });
    }

    console.log('Extracted document ID:', docId);

    // Fetch the document content
    let content: string;
    try {
      content = await fetchGoogleDocContent(docId);
      console.log('Fetched document content, length:', content.length);
    } catch (fetchError) {
      console.error('Error fetching Google Doc:', fetchError);
      return res.status(400).json({
        success: false,
        message: fetchError instanceof Error ? fetchError.message : 'Failed to fetch Google Doc'
      });
    }

    // Parse content into posts
    const posts = parseDocumentIntoPosts(content);
    console.log('Parsed', posts.length, 'posts from document');

    if (posts.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No posts found in the Google Doc. Make sure posts are separated by blank lines and are at least 5 characters long.'
      });
    }

    // Schedule each post to Hypefury
    const results: Array<{
      index: number;
      success: boolean;
      message: string;
      preview: string;
    }> = [];

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < posts.length; i++) {
      const postContent = posts[i];

      const postData = {
        text: postContent
      };

      console.log(`Scheduling post ${i + 1}/${posts.length}:`, postContent.substring(0, 50) + '...');
      const response = await makeHfRequest(HF_SCHEDULE_ENDPOINT, JSON.stringify(postData), clientApiKey);

      if (response && (response.statusCode === 200 || response.statusCode === 201)) {
        successCount++;
        results.push({
          index: i,
          success: true,
          message: 'Added to queue',
          preview: postContent.substring(0, 50) + (postContent.length > 50 ? '...' : '')
        });
      } else {
        failCount++;
        results.push({
          index: i,
          success: false,
          message: response?.message || `HTTP ${response?.statusCode || 'Unknown'}`,
          preview: postContent.substring(0, 50) + (postContent.length > 50 ? '...' : '')
        });
      }

      // Small delay between requests to avoid rate limiting
      if (i < posts.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    return res.status(200).json({
      success: failCount === 0,
      message: `Imported and scheduled ${successCount}/${posts.length} posts from Google Doc`,
      posts: posts,
      summary: {
        total: posts.length,
        success: successCount,
        failed: failCount
      },
      results
    });
  } catch (error) {
    console.error('Google Doc import error:', error);
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
