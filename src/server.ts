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
            max-width: 600px;
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
        h1 { color: #333; margin-bottom: 10px; }
        .subtitle { color: #666; margin-bottom: 25px; }
        label { display: block; margin-bottom: 8px; font-weight: 500; color: #444; }
        textarea, input, select {
            width: 100%;
            padding: 12px;
            margin-bottom: 15px;
            font-size: 16px;
            border: 1px solid #ddd;
            border-radius: 8px;
            transition: border-color 0.2s;
        }
        textarea:focus, input:focus, select:focus {
            outline: none;
            border-color: #4CAF50;
        }
        textarea { min-height: 150px; resize: vertical; }
        button {
            padding: 15px 30px;
            font-size: 16px;
            font-weight: 600;
            background: #4CAF50;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            transition: background 0.2s;
            margin-bottom: 10px;
        }
        button:hover { background: #45a049; }
        button:disabled { background: #ccc; cursor: not-allowed; }
        button.secondary { background: #2196F3; }
        button.secondary:hover { background: #1976D2; }
        button.full-width { width: 100%; }
        button.small { padding: 8px 16px; font-size: 14px; margin: 0; }
        button.danger { background: #dc3545; }
        button.danger:hover { background: #c82333; }
        button.outline {
            background: white;
            color: #666;
            border: 2px solid #ddd;
        }
        button.outline:hover { background: #f5f5f5; border-color: #ccc; }
        #result {
            margin-top: 20px;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 8px;
            white-space: pre-wrap;
            font-family: monospace;
            font-size: 14px;
            display: none;
        }
        #result.show { display: block; }
        #result.success { background: #d4edda; color: #155724; }
        #result.error { background: #f8d7da; color: #721c24; }
        #result.info { background: #cce5ff; color: #004085; }
        .help-text { font-size: 13px; color: #888; margin-top: -10px; margin-bottom: 15px; }

        /* Client selector styles */
        .client-selector {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
            align-items: flex-end;
        }
        .client-selector .select-wrapper {
            flex: 1;
        }
        .client-selector select {
            margin-bottom: 0;
        }
        .client-selector button {
            margin-bottom: 0;
            white-space: nowrap;
        }
        .selected-client {
            background: #e8f5e9;
            border: 1px solid #4CAF50;
            border-radius: 8px;
            padding: 10px 15px;
            margin-bottom: 15px;
            display: none;
        }
        .selected-client.show {
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .selected-client .client-name {
            font-weight: 600;
            color: #2e7d32;
        }

        /* Modal styles */
        .modal-overlay {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.5);
            z-index: 1000;
            overflow-y: auto;
            padding: 20px;
        }
        .modal-overlay.show { display: flex; align-items: flex-start; justify-content: center; }
        .modal {
            background: white;
            border-radius: 12px;
            max-width: 500px;
            width: 100%;
            margin: 20px auto;
            box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        }
        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 20px;
            border-bottom: 1px solid #eee;
        }
        .modal-header h2 { margin: 0; color: #333; }
        .modal-close {
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: #999;
            padding: 0;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .modal-close:hover { color: #333; background: none; }
        .modal-body { padding: 20px; }
        .modal-section {
            margin-bottom: 25px;
            padding-bottom: 20px;
            border-bottom: 1px solid #eee;
        }
        .modal-section:last-child { border-bottom: none; margin-bottom: 0; }
        .modal-section h3 { margin: 0 0 15px 0; color: #444; font-size: 16px; }

        /* Client list styles */
        .client-list {
            max-height: 300px;
            overflow-y: auto;
        }
        .client-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px;
            border: 1px solid #eee;
            border-radius: 8px;
            margin-bottom: 8px;
        }
        .client-item:last-child { margin-bottom: 0; }
        .client-item .client-info {
            flex: 1;
        }
        .client-item .client-name { font-weight: 500; }
        .client-item .client-key { font-size: 12px; color: #888; font-family: monospace; }
        .client-item .client-actions {
            display: flex;
            gap: 8px;
        }
        .no-clients {
            text-align: center;
            padding: 30px;
            color: #888;
        }

        /* Help section */
        .help-section {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 15px;
        }
        .help-section h4 { margin: 0 0 10px 0; color: #333; font-size: 14px; }
        .help-section ol {
            margin: 0;
            padding-left: 20px;
            font-size: 13px;
            color: #666;
        }
        .help-section li { margin-bottom: 5px; }
        .help-section .warning {
            margin-top: 10px;
            padding: 10px;
            background: #fff3cd;
            border-radius: 4px;
            font-size: 12px;
            color: #856404;
        }

        /* Form group */
        .form-group { margin-bottom: 15px; }
        .form-group:last-child { margin-bottom: 0; }
        .form-row {
            display: flex;
            gap: 10px;
        }
        .form-row > * { flex: 1; }

        /* Edit form */
        .edit-form {
            display: none;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 8px;
            margin-top: 8px;
        }
        .edit-form.show { display: block; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Hypefury Scheduler</h1>
        <p class="subtitle">Import posts from Google Docs to Hypefury</p>

        <!-- Client Selector -->
        <div class="client-selector">
            <div class="select-wrapper">
                <label for="clientSelect">Select Client</label>
                <select id="clientSelect">
                    <option value="">-- Select a client --</option>
                </select>
            </div>
            <button type="button" class="outline" onclick="openClientManager()">Manage Clients</button>
        </div>

        <div id="selectedClientBanner" class="selected-client">
            <span>Scheduling for: <span class="client-name" id="selectedClientName"></span></span>
            <button type="button" class="small outline" onclick="clearClientSelection()">Change</button>
        </div>

        <label for="docUrl">Google Doc URL</label>
        <input type="url" id="docUrl" placeholder="https://docs.google.com/document/d/your-doc-id/edit">
        <p class="help-text">Make sure your doc is shared as "Anyone with the link can view"</p>
        <button onclick="submitGoogleDoc()" id="submitDocBtn" class="full-width">Import from Google Doc</button>

        <div id="result"></div>
    </div>

    <!-- Client Management Modal -->
    <div id="clientModal" class="modal-overlay">
        <div class="modal">
            <div class="modal-header">
                <h2>Manage Clients</h2>
                <button class="modal-close" onclick="closeClientManager()">&times;</button>
            </div>
            <div class="modal-body">
                <!-- Add New Client -->
                <div class="modal-section">
                    <h3>Add New Client</h3>
                    <div class="form-group">
                        <label for="newClientName">Client Name</label>
                        <input type="text" id="newClientName" placeholder="e.g., Acme Corp">
                    </div>
                    <div class="form-group">
                        <label for="newClientApiKey">Hypefury API Key</label>
                        <input type="text" id="newClientApiKey" placeholder="Paste API key here">
                    </div>
                    <button onclick="addClient()" class="full-width">Add Client</button>
                    <div id="addClientResult" style="margin-top: 10px;"></div>
                </div>

                <!-- Existing Clients -->
                <div class="modal-section">
                    <h3>Existing Clients</h3>
                    <div id="clientList" class="client-list">
                        <div class="no-clients">Loading clients...</div>
                    </div>
                </div>

                <!-- Help -->
                <div class="modal-section">
                    <div class="help-section">
                        <h4>How to Find Your Hypefury API Key</h4>
                        <ol>
                            <li>Log into your client's Hypefury account</li>
                            <li>Click Settings (gear icon in the sidebar)</li>
                            <li>Click "Integrations" in the menu</li>
                            <li>Scroll down to "API Access"</li>
                            <li>Click "Generate API Key" or copy the existing key</li>
                            <li>Paste the key above</li>
                        </ol>
                        <div class="warning">
                            Keep API keys secure - they provide full access to schedule posts on the account!
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        let selectedClientId = null;
        let clients = [];

        // Load clients on page load
        document.addEventListener('DOMContentLoaded', loadClients);

        async function loadClients() {
            try {
                const response = await fetch('/api/clients');
                const data = await response.json();
                if (data.success) {
                    clients = data.clients;
                    updateClientDropdown();
                    updateClientList();
                }
            } catch (error) {
                console.error('Error loading clients:', error);
            }
        }

        function updateClientDropdown() {
            const select = document.getElementById('clientSelect');
            const currentValue = select.value;

            select.innerHTML = '<option value="">-- Select a client --</option>';
            clients.forEach(client => {
                const option = document.createElement('option');
                option.value = client.id;
                option.textContent = client.name;
                select.appendChild(option);
            });

            // Restore selection if still valid
            if (currentValue && clients.some(c => c.id == currentValue)) {
                select.value = currentValue;
            }
        }

        function updateClientList() {
            const listEl = document.getElementById('clientList');

            if (clients.length === 0) {
                listEl.innerHTML = '<div class="no-clients">No clients added yet. Add your first client above!</div>';
                return;
            }

            listEl.innerHTML = clients.map(client => \`
                <div class="client-item" data-id="\${client.id}">
                    <div class="client-info">
                        <div class="client-name">\${escapeHtml(client.name)}</div>
                    </div>
                    <div class="client-actions">
                        <button class="small outline" onclick="editClient(\${client.id})">Edit</button>
                        <button class="small danger" onclick="confirmDeleteClient(\${client.id}, '\${escapeHtml(client.name)}')">Delete</button>
                    </div>
                </div>
                <div id="editForm\${client.id}" class="edit-form">
                    <div class="form-group">
                        <label>Client Name</label>
                        <input type="text" id="editName\${client.id}" value="\${escapeHtml(client.name)}">
                    </div>
                    <div class="form-group">
                        <label>New API Key (leave blank to keep current)</label>
                        <input type="text" id="editKey\${client.id}" placeholder="Enter new API key">
                    </div>
                    <div class="form-row">
                        <button class="small" onclick="saveClient(\${client.id})">Save</button>
                        <button class="small outline" onclick="cancelEdit(\${client.id})">Cancel</button>
                    </div>
                </div>
            \`).join('');
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // Client selection
        document.getElementById('clientSelect').addEventListener('change', function() {
            selectedClientId = this.value ? parseInt(this.value) : null;
            const banner = document.getElementById('selectedClientBanner');
            const nameEl = document.getElementById('selectedClientName');

            if (selectedClientId) {
                const client = clients.find(c => c.id === selectedClientId);
                if (client) {
                    nameEl.textContent = client.name;
                    banner.classList.add('show');
                    this.parentElement.parentElement.querySelector('.select-wrapper').style.display = 'none';
                }
            } else {
                banner.classList.remove('show');
            }
        });

        function clearClientSelection() {
            selectedClientId = null;
            document.getElementById('clientSelect').value = '';
            document.getElementById('selectedClientBanner').classList.remove('show');
            document.querySelector('.client-selector .select-wrapper').style.display = 'block';
        }

        // Modal functions
        function openClientManager() {
            loadClients();
            document.getElementById('clientModal').classList.add('show');
            document.body.style.overflow = 'hidden';
        }

        function closeClientManager() {
            document.getElementById('clientModal').classList.remove('show');
            document.body.style.overflow = '';
            // Clear add form
            document.getElementById('newClientName').value = '';
            document.getElementById('newClientApiKey').value = '';
            document.getElementById('addClientResult').innerHTML = '';
        }

        // Close modal on overlay click
        document.getElementById('clientModal').addEventListener('click', function(e) {
            if (e.target === this) closeClientManager();
        });

        // Add client
        async function addClient() {
            const name = document.getElementById('newClientName').value.trim();
            const apiKey = document.getElementById('newClientApiKey').value.trim();
            const resultEl = document.getElementById('addClientResult');

            if (!name) {
                resultEl.innerHTML = '<div style="color: #dc3545;">Please enter a client name</div>';
                return;
            }
            if (!apiKey) {
                resultEl.innerHTML = '<div style="color: #dc3545;">Please enter an API key</div>';
                return;
            }

            resultEl.innerHTML = '<div style="color: #666;">Adding client...</div>';

            try {
                const response = await fetch('/api/clients', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, apiKey })
                });

                const data = await response.json();

                if (data.success) {
                    resultEl.innerHTML = '<div style="color: #28a745;">Client added successfully!</div>';
                    document.getElementById('newClientName').value = '';
                    document.getElementById('newClientApiKey').value = '';
                    await loadClients();
                    setTimeout(() => { resultEl.innerHTML = ''; }, 3000);
                } else {
                    resultEl.innerHTML = '<div style="color: #dc3545;">' + escapeHtml(data.message) + '</div>';
                }
            } catch (error) {
                resultEl.innerHTML = '<div style="color: #dc3545;">Error: ' + escapeHtml(error.message) + '</div>';
            }
        }

        // Edit client
        function editClient(id) {
            // Close any other edit forms
            document.querySelectorAll('.edit-form').forEach(form => form.classList.remove('show'));
            document.getElementById('editForm' + id).classList.add('show');
        }

        function cancelEdit(id) {
            document.getElementById('editForm' + id).classList.remove('show');
            // Reset values
            const client = clients.find(c => c.id === id);
            if (client) {
                document.getElementById('editName' + id).value = client.name;
                document.getElementById('editKey' + id).value = '';
            }
        }

        async function saveClient(id) {
            const name = document.getElementById('editName' + id).value.trim();
            const apiKey = document.getElementById('editKey' + id).value.trim();

            if (!name) {
                alert('Client name is required');
                return;
            }

            const body = { name };
            if (apiKey) body.apiKey = apiKey;

            try {
                const response = await fetch('/api/clients/' + id, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });

                const data = await response.json();

                if (data.success) {
                    await loadClients();
                    document.getElementById('editForm' + id).classList.remove('show');
                } else {
                    alert(data.message);
                }
            } catch (error) {
                alert('Error: ' + error.message);
            }
        }

        // Delete client
        function confirmDeleteClient(id, name) {
            if (confirm('Delete "' + name + '"?\\n\\nThis cannot be undone.')) {
                deleteClient(id);
            }
        }

        async function deleteClient(id) {
            try {
                const response = await fetch('/api/clients/' + id, {
                    method: 'DELETE'
                });

                const data = await response.json();

                if (data.success) {
                    if (selectedClientId === id) {
                        clearClientSelection();
                    }
                    await loadClients();
                } else {
                    alert(data.message);
                }
            } catch (error) {
                alert('Error: ' + error.message);
            }
        }

        // Submit Google Doc
        async function submitGoogleDoc() {
            const result = document.getElementById('result');

            if (!selectedClientId) {
                result.textContent = 'Please select a client before importing from Google Doc';
                result.className = 'show error';
                return;
            }

            const docUrl = document.getElementById('docUrl').value.trim();
            const btn = document.getElementById('submitDocBtn');

            if (!docUrl) {
                result.textContent = 'Please enter a Google Doc URL';
                result.className = 'show error';
                return;
            }

            if (!docUrl.includes('docs.google.com/document')) {
                result.textContent = 'Please enter a valid Google Docs URL (docs.google.com/document/...)';
                result.className = 'show error';
                return;
            }

            btn.disabled = true;
            btn.textContent = 'Fetching document...';
            const clientName = clients.find(c => c.id === selectedClientId)?.name || 'Unknown';
            result.textContent = 'Fetching and parsing Google Doc for ' + clientName + '...';
            result.className = 'show info';

            try {
                const response = await fetch('/api/schedule/google-doc', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: docUrl, clientId: selectedClientId })
                });

                const data = await response.json();

                if (data.success) {
                    result.textContent = '✓ ' + data.message + ' (for ' + clientName + ')';
                    if (data.posts && data.posts.length > 0) {
                        result.textContent += '\\n\\nPosts scheduled:\\n' + data.posts.map((p, i) => (i+1) + '. ' + p.substring(0, 50) + (p.length > 50 ? '...' : '')).join('\\n');
                    }
                    result.className = 'show success';
                    document.getElementById('docUrl').value = '';
                } else {
                    result.textContent = '✗ Error: ' + (data.message || 'Unknown error');
                    result.className = 'show error';
                }
            } catch (error) {
                result.textContent = '✗ Error: ' + error.message;
                result.className = 'show error';
            } finally {
                btn.disabled = false;
                btn.textContent = 'Import from Google Doc';
            }
        }

        // Keyboard shortcut - Enter to submit
        document.getElementById('docUrl').addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                submitGoogleDoc();
            }
        });

        // Escape to close modal
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                closeClientManager();
            }
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
