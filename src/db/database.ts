import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Client interface
export interface Client {
    id: number;
    name: string;
    api_key: string;
    created_at: string;
    updated_at: string;
}

// Client without sensitive data (for API responses)
export interface ClientSafe {
    id: number;
    name: string;
    created_at: string;
}

// Database path - use /app/data in production (Docker), or ./data locally
const DATA_DIR = process.env.NODE_ENV === 'production'
    ? '/app/data'
    : path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'clients.db');

let db: Database.Database | null = null;

/**
 * Initialize the database connection and create tables if needed
 */
export function initializeDatabase(): void {
    // Ensure data directory exists
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        console.log(`Created data directory: ${DATA_DIR}`);
    }

    // Open database connection
    db = new Database(DB_PATH);
    console.log(`Database initialized at: ${DB_PATH}`);

    // Create clients table if it doesn't exist
    db.exec(`
        CREATE TABLE IF NOT EXISTS clients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            api_key TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);
    `);

    console.log('Database tables initialized');
}

/**
 * Get database instance (throws if not initialized)
 */
function getDb(): Database.Database {
    if (!db) {
        throw new Error('Database not initialized. Call initializeDatabase() first.');
    }
    return db;
}

/**
 * Get all clients (safe version without API keys)
 */
export function getAllClients(): ClientSafe[] {
    const stmt = getDb().prepare('SELECT id, name, created_at FROM clients ORDER BY name ASC');
    return stmt.all() as ClientSafe[];
}

/**
 * Get all clients with full details (including API keys)
 * Use with caution - only for internal operations
 */
export function getAllClientsWithKeys(): Client[] {
    const stmt = getDb().prepare('SELECT * FROM clients ORDER BY name ASC');
    return stmt.all() as Client[];
}

/**
 * Get a client by ID
 */
export function getClientById(id: number): Client | undefined {
    const stmt = getDb().prepare('SELECT * FROM clients WHERE id = ?');
    return stmt.get(id) as Client | undefined;
}

/**
 * Get a client by name
 */
export function getClientByName(name: string): Client | undefined {
    const stmt = getDb().prepare('SELECT * FROM clients WHERE name = ?');
    return stmt.get(name) as Client | undefined;
}

/**
 * Create a new client
 */
export function createClient(name: string, apiKey: string): Client {
    const trimmedName = name.trim();
    const trimmedKey = apiKey.trim();

    if (!trimmedName) {
        throw new Error('Client name is required');
    }
    if (!trimmedKey) {
        throw new Error('API key is required');
    }

    // Check for duplicate name
    const existing = getClientByName(trimmedName);
    if (existing) {
        throw new Error('A client with this name already exists');
    }

    const stmt = getDb().prepare(`
        INSERT INTO clients (name, api_key) VALUES (?, ?)
    `);

    const result = stmt.run(trimmedName, trimmedKey);

    return getClientById(result.lastInsertRowid as number)!;
}

/**
 * Update an existing client
 */
export function updateClient(id: number, name?: string, apiKey?: string): Client {
    const existing = getClientById(id);
    if (!existing) {
        throw new Error('Client not found');
    }

    const newName = name?.trim() || existing.name;
    const newKey = apiKey?.trim() || existing.api_key;

    // Check for duplicate name (if name is being changed)
    if (newName !== existing.name) {
        const duplicate = getClientByName(newName);
        if (duplicate) {
            throw new Error('A client with this name already exists');
        }
    }

    const stmt = getDb().prepare(`
        UPDATE clients
        SET name = ?, api_key = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `);

    stmt.run(newName, newKey, id);

    return getClientById(id)!;
}

/**
 * Delete a client
 */
export function deleteClient(id: number): boolean {
    const existing = getClientById(id);
    if (!existing) {
        throw new Error('Client not found');
    }

    const stmt = getDb().prepare('DELETE FROM clients WHERE id = ?');
    const result = stmt.run(id);

    return result.changes > 0;
}

/**
 * Mask an API key for safe display (show only last 4 characters)
 */
export function maskApiKey(apiKey: string): string {
    if (apiKey.length <= 4) {
        return '****';
    }
    return '****' + apiKey.slice(-4);
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
    if (db) {
        db.close();
        db = null;
        console.log('Database connection closed');
    }
}
