/**
 * Persistent Logger
 *
 * Provides structured logging that persists to the database.
 * Logs are accessible through the dashboard for non-technical team review.
 */

import { getOperationsDb } from '../db/operations.js';

export type LogLevel = 'info' | 'warn' | 'error';
export type LogCategory = 'api' | 'database' | 'pipeline' | 'scheduler' | 'client' | 'system';

export interface LogEntry {
    id: number;
    timestamp: string;
    level: LogLevel;
    category: LogCategory;
    operation_id: number | null;
    client_id: number | null;
    error_code: string | null;
    message: string;
    details: string | null;
}

export interface LogFilters {
    level?: LogLevel;
    category?: LogCategory;
    clientId?: number;
    operationId?: number;
    errorCode?: string;
    since?: string;
    limit?: number;
    offset?: number;
}

let initialized = false;

/**
 * Initialize the logs table in the operations database
 */
export function initializeLogsTable(): void {
    if (initialized) return;

    const db = getOperationsDb();
    db.exec(`
        CREATE TABLE IF NOT EXISTS system_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            level TEXT NOT NULL,
            category TEXT NOT NULL,
            operation_id INTEGER,
            client_id INTEGER,
            error_code TEXT,
            message TEXT NOT NULL,
            details TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON system_logs(timestamp);
        CREATE INDEX IF NOT EXISTS idx_logs_level ON system_logs(level);
        CREATE INDEX IF NOT EXISTS idx_logs_category ON system_logs(category);
        CREATE INDEX IF NOT EXISTS idx_logs_error_code ON system_logs(error_code);
    `);

    initialized = true;
    console.log('[Logger] System logs table initialized');
}

/**
 * Write a log entry to the database
 */
function writeLog(
    level: LogLevel,
    category: LogCategory,
    message: string,
    options?: {
        operationId?: number;
        clientId?: number;
        errorCode?: string;
        details?: string | Record<string, any>;
    }
): void {
    try {
        // Also log to console with prefix
        const prefix = `[${category.toUpperCase()}]`;
        const logFn = level === 'error' ? console.error :
                      level === 'warn' ? console.warn :
                      console.log;
        logFn(`${prefix} ${message}`);

        // Ensure table exists
        if (!initialized) {
            initializeLogsTable();
        }

        const db = getOperationsDb();
        const details = options?.details
            ? typeof options.details === 'string'
                ? options.details
                : JSON.stringify(options.details)
            : null;

        const stmt = db.prepare(`
            INSERT INTO system_logs (level, category, operation_id, client_id, error_code, message, details)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
            level,
            category,
            options?.operationId || null,
            options?.clientId || null,
            options?.errorCode || null,
            message,
            details
        );
    } catch (err) {
        // Don't throw from logger - just console log the error
        console.error('[Logger] Failed to write log:', err);
    }
}

/**
 * Log an info message
 */
export function logInfo(
    category: LogCategory,
    message: string,
    options?: {
        operationId?: number;
        clientId?: number;
        details?: string | Record<string, any>;
    }
): void {
    writeLog('info', category, message, options);
}

/**
 * Log a warning message
 */
export function logWarn(
    category: LogCategory,
    message: string,
    options?: {
        operationId?: number;
        clientId?: number;
        errorCode?: string;
        details?: string | Record<string, any>;
    }
): void {
    writeLog('warn', category, message, options);
}

/**
 * Log an error message
 */
export function logError(
    category: LogCategory,
    message: string,
    options?: {
        operationId?: number;
        clientId?: number;
        errorCode?: string;
        details?: string | Record<string, any>;
    }
): void {
    writeLog('error', category, message, options);
}

/**
 * Get recent logs with optional filters
 */
export function getRecentLogs(filters?: LogFilters): LogEntry[] {
    if (!initialized) {
        initializeLogsTable();
    }

    const db = getOperationsDb();
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters?.level) {
        conditions.push('level = ?');
        params.push(filters.level);
    }

    if (filters?.category) {
        conditions.push('category = ?');
        params.push(filters.category);
    }

    if (filters?.clientId) {
        conditions.push('client_id = ?');
        params.push(filters.clientId);
    }

    if (filters?.operationId) {
        conditions.push('operation_id = ?');
        params.push(filters.operationId);
    }

    if (filters?.errorCode) {
        conditions.push('error_code = ?');
        params.push(filters.errorCode);
    }

    if (filters?.since) {
        conditions.push('timestamp >= ?');
        params.push(filters.since);
    }

    let query = 'SELECT * FROM system_logs';
    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY timestamp DESC';

    const limit = filters?.limit || 100;
    const offset = filters?.offset || 0;
    query += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const stmt = db.prepare(query);
    return stmt.all(...params) as LogEntry[];
}

/**
 * Get count of logs by level
 */
export function getLogCounts(): { info: number; warn: number; error: number } {
    if (!initialized) {
        initializeLogsTable();
    }

    const db = getOperationsDb();
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const result = db.prepare(`
        SELECT
            SUM(CASE WHEN level = 'info' THEN 1 ELSE 0 END) as info,
            SUM(CASE WHEN level = 'warn' THEN 1 ELSE 0 END) as warn,
            SUM(CASE WHEN level = 'error' THEN 1 ELSE 0 END) as error
        FROM system_logs
        WHERE timestamp >= ?
    `).get(since24h) as { info: number; warn: number; error: number };

    return {
        info: result.info || 0,
        warn: result.warn || 0,
        error: result.error || 0
    };
}

/**
 * Delete old logs (for maintenance)
 */
export function cleanOldLogs(olderThanDays: number = 30): number {
    if (!initialized) {
        initializeLogsTable();
    }

    const db = getOperationsDb();
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();

    const stmt = db.prepare('DELETE FROM system_logs WHERE timestamp < ?');
    const result = stmt.run(cutoff);

    console.log(`[Logger] Cleaned ${result.changes} logs older than ${olderThanDays} days`);
    return result.changes;
}
