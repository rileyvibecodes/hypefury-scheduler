/**
 * Operations Database
 *
 * Tracks scheduling operations and individual posts for:
 * - Operation history and status
 * - Post quality metrics
 * - Retry queue management
 * - Dashboard statistics
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// ============================================
// Types
// ============================================

export interface Operation {
  id: number;
  client_id: number;
  operation_type: 'google_doc' | 'webhook' | 'bulk' | 'single' | 'retry';
  source_url: string | null;
  total_posts: number;
  successful_posts: number;
  failed_posts: number;
  corrected_posts: number;
  rejected_posts: number;
  status: 'pending' | 'processing' | 'completed' | 'partial' | 'failed';
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface Post {
  id: number;
  operation_id: number;
  client_id: number;
  original_content: string;
  processed_content: string;
  quality_score: number;
  issues_detected: string; // JSON array
  corrections_applied: string; // JSON array
  status: 'queued' | 'sent' | 'failed' | 'rejected' | 'permanently_failed';
  hypefury_response: string | null;
  retry_count: number;
  next_retry_at: string | null;
  created_at: string;
  sent_at: string | null;
}

export interface HealthMetrics {
  id: number;
  timestamp: string;
  api_status: 'healthy' | 'degraded' | 'down';
  total_operations_24h: number;
  success_rate_24h: number;
  avg_quality_score_24h: number;
  posts_corrected_24h: number;
  posts_rejected_24h: number;
  queue_size: number;
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'down';
  successRate: number;
  totalOperations: number;
  avgQualityScore: number;
  postsCorrected: number;
  postsRejected: number;
  queueSize: number;
  lastUpdated: string;
}

// ============================================
// Database Setup
// ============================================

const DATA_DIR = process.env.NODE_ENV === 'production'
  ? '/app/data'
  : path.join(process.cwd(), 'data');
const OPS_DB_PATH = path.join(DATA_DIR, 'operations.db');

let opsDb: Database.Database | null = null;

/**
 * Initialize the operations database
 */
export function initializeOperationsDb(): void {
  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  opsDb = new Database(OPS_DB_PATH);
  console.log(`Operations database initialized at: ${OPS_DB_PATH}`);

  // Create tables
  opsDb.exec(`
    -- Operations log
    CREATE TABLE IF NOT EXISTS operations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      operation_type TEXT NOT NULL,
      source_url TEXT,
      total_posts INTEGER NOT NULL DEFAULT 0,
      successful_posts INTEGER DEFAULT 0,
      failed_posts INTEGER DEFAULT 0,
      corrected_posts INTEGER DEFAULT 0,
      rejected_posts INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      error_message TEXT,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME
    );

    -- Individual posts with quality tracking
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation_id INTEGER NOT NULL,
      client_id INTEGER NOT NULL,
      original_content TEXT NOT NULL,
      processed_content TEXT NOT NULL,
      quality_score INTEGER DEFAULT 100,
      issues_detected TEXT DEFAULT '[]',
      corrections_applied TEXT DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'queued',
      hypefury_response TEXT,
      retry_count INTEGER DEFAULT 0,
      next_retry_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      sent_at DATETIME,
      FOREIGN KEY (operation_id) REFERENCES operations(id)
    );

    -- Health metrics snapshots
    CREATE TABLE IF NOT EXISTS health_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      api_status TEXT NOT NULL,
      total_operations_24h INTEGER,
      success_rate_24h REAL,
      avg_quality_score_24h REAL,
      posts_corrected_24h INTEGER,
      posts_rejected_24h INTEGER,
      queue_size INTEGER
    );

    -- Indexes for performance
    CREATE INDEX IF NOT EXISTS idx_operations_client ON operations(client_id);
    CREATE INDEX IF NOT EXISTS idx_operations_status ON operations(status);
    CREATE INDEX IF NOT EXISTS idx_operations_started ON operations(started_at);
    CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
    CREATE INDEX IF NOT EXISTS idx_posts_retry ON posts(next_retry_at);
    CREATE INDEX IF NOT EXISTS idx_posts_operation ON posts(operation_id);
  `);

  console.log('Operations database tables initialized');
}

/**
 * Get operations database instance
 */
export function getOperationsDb(): Database.Database {
  if (!opsDb) {
    throw new Error('Operations database not initialized. Call initializeOperationsDb() first.');
  }
  return opsDb;
}

// ============================================
// Operation Functions
// ============================================

/**
 * Create a new operation record
 */
export function createOperation(
  clientId: number,
  operationType: Operation['operation_type'],
  sourceUrl?: string
): number {
  const stmt = getOperationsDb().prepare(`
    INSERT INTO operations (client_id, operation_type, source_url, status)
    VALUES (?, ?, ?, 'processing')
  `);
  const result = stmt.run(clientId, operationType, sourceUrl || null);
  return result.lastInsertRowid as number;
}

/**
 * Update operation with total post count
 */
export function updateOperationTotal(operationId: number, total: number): void {
  const stmt = getOperationsDb().prepare(`
    UPDATE operations SET total_posts = ? WHERE id = ?
  `);
  stmt.run(total, operationId);
}

/**
 * Complete an operation with final counts
 */
export function completeOperation(
  operationId: number,
  counts: {
    successful: number;
    failed: number;
    corrected: number;
    rejected: number;
  }
): void {
  const { successful, failed, corrected, rejected } = counts;

  // Determine status
  let status: Operation['status'] = 'completed';
  if (failed > 0 || rejected > 0) {
    status = successful > 0 ? 'partial' : 'failed';
  }

  const stmt = getOperationsDb().prepare(`
    UPDATE operations
    SET successful_posts = ?,
        failed_posts = ?,
        corrected_posts = ?,
        rejected_posts = ?,
        status = ?,
        completed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  stmt.run(successful, failed, corrected, rejected, status, operationId);
}

/**
 * Mark operation as failed
 */
export function failOperation(operationId: number, errorMessage: string): void {
  const stmt = getOperationsDb().prepare(`
    UPDATE operations
    SET status = 'failed',
        error_message = ?,
        completed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  stmt.run(errorMessage, operationId);
}

/**
 * Get recent operations
 * Note: Client names are looked up separately since clients are in a different database
 */
export function getRecentOperations(limit: number = 20, clientId?: number): (Operation & { clientName?: string })[] {
  let query = `SELECT * FROM operations`;

  if (clientId) {
    query += ` WHERE client_id = ?`;
  }

  query += ` ORDER BY started_at DESC LIMIT ?`;

  const stmt = getOperationsDb().prepare(query);
  const operations = clientId
    ? stmt.all(clientId, limit) as Operation[]
    : stmt.all(limit) as Operation[];

  // Import getClientById dynamically to avoid circular dependency
  // Client names will be added by the API endpoint that has access to the clients db
  return operations.map(op => ({
    ...op,
    clientName: undefined // Will be enriched by caller if needed
  }));
}

/**
 * Get operation by ID
 */
export function getOperationById(operationId: number): Operation | undefined {
  const stmt = getOperationsDb().prepare('SELECT * FROM operations WHERE id = ?');
  return stmt.get(operationId) as Operation | undefined;
}

// ============================================
// Post Functions
// ============================================

/**
 * Create a post record
 */
export function createPostRecord(
  operationId: number,
  clientId: number,
  data: {
    originalContent: string;
    processedContent: string;
    qualityScore: number;
    issues: any[];
    corrections: string[];
    status: Post['status'];
  }
): number {
  const stmt = getOperationsDb().prepare(`
    INSERT INTO posts (
      operation_id, client_id, original_content, processed_content,
      quality_score, issues_detected, corrections_applied, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    operationId,
    clientId,
    data.originalContent,
    data.processedContent,
    data.qualityScore,
    JSON.stringify(data.issues),
    JSON.stringify(data.corrections),
    data.status
  );

  return result.lastInsertRowid as number;
}

/**
 * Mark post as sent
 */
export function markPostSent(postId: number, response: string): void {
  const stmt = getOperationsDb().prepare(`
    UPDATE posts
    SET status = 'sent',
        sent_at = CURRENT_TIMESTAMP,
        hypefury_response = ?
    WHERE id = ?
  `);
  stmt.run(response, postId);
}

/**
 * Mark post as failed and queue for retry
 */
export function markPostFailed(postId: number, errorMessage: string, nextRetryAt: Date): void {
  const stmt = getOperationsDb().prepare(`
    UPDATE posts
    SET status = 'failed',
        retry_count = retry_count + 1,
        next_retry_at = ?,
        hypefury_response = ?
    WHERE id = ?
  `);
  stmt.run(nextRetryAt.toISOString(), errorMessage, postId);
}

/**
 * Mark post as permanently failed
 */
export function markPostPermanentlyFailed(postId: number, errorMessage: string): void {
  const stmt = getOperationsDb().prepare(`
    UPDATE posts
    SET status = 'permanently_failed',
        hypefury_response = ?
    WHERE id = ?
  `);
  stmt.run(errorMessage, postId);
}

/**
 * Get post by ID
 */
export function getPostById(postId: number): Post | undefined {
  const stmt = getOperationsDb().prepare('SELECT * FROM posts WHERE id = ?');
  return stmt.get(postId) as Post | undefined;
}

/**
 * Get posts for an operation
 */
export function getPostsByOperation(operationId: number): Post[] {
  const stmt = getOperationsDb().prepare('SELECT * FROM posts WHERE operation_id = ? ORDER BY id ASC');
  return stmt.all(operationId) as Post[];
}

// ============================================
// Queue Functions
// ============================================

/**
 * Get posts due for retry
 */
export function getPostsDueForRetry(limit: number = 10): Post[] {
  const now = new Date().toISOString();
  const stmt = getOperationsDb().prepare(`
    SELECT * FROM posts
    WHERE status = 'failed'
      AND next_retry_at <= ?
    ORDER BY next_retry_at ASC
    LIMIT ?
  `);
  return stmt.all(now, limit) as Post[];
}

/**
 * Get queue status counts
 */
export function getQueueStatus(): {
  pending: number;
  failed: number;
  permanentlyFailed: number;
} {
  const db = getOperationsDb();

  const pending = db.prepare(
    "SELECT COUNT(*) as count FROM posts WHERE status = 'queued'"
  ).get() as { count: number };

  const failed = db.prepare(
    "SELECT COUNT(*) as count FROM posts WHERE status = 'failed'"
  ).get() as { count: number };

  const permanentlyFailed = db.prepare(
    "SELECT COUNT(*) as count FROM posts WHERE status = 'permanently_failed'"
  ).get() as { count: number };

  return {
    pending: pending.count,
    failed: failed.count,
    permanentlyFailed: permanentlyFailed.count
  };
}

// ============================================
// Health & Statistics Functions
// ============================================

/**
 * Get system health metrics
 */
export function getSystemHealth(): SystemHealth {
  const db = getOperationsDb();

  // Get 24h window
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Total operations in last 24h
  const opsResult = db.prepare(`
    SELECT COUNT(*) as count FROM operations WHERE started_at >= ?
  `).get(since24h) as { count: number };

  // Successful operations
  const successResult = db.prepare(`
    SELECT COUNT(*) as count FROM operations
    WHERE started_at >= ? AND status = 'completed'
  `).get(since24h) as { count: number };

  // Calculate success rate
  const successRate = opsResult.count > 0
    ? successResult.count / opsResult.count
    : 1;

  // Average quality score
  const qualityResult = db.prepare(`
    SELECT AVG(quality_score) as avg FROM posts WHERE created_at >= ?
  `).get(since24h) as { avg: number | null };

  // Posts corrected
  const correctedResult = db.prepare(`
    SELECT COUNT(*) as count FROM posts
    WHERE created_at >= ? AND corrections_applied != '[]'
  `).get(since24h) as { count: number };

  // Posts rejected
  const rejectedResult = db.prepare(`
    SELECT COUNT(*) as count FROM posts
    WHERE created_at >= ? AND status = 'rejected'
  `).get(since24h) as { count: number };

  // Queue size
  const queueStatus = getQueueStatus();
  const queueSize = queueStatus.pending + queueStatus.failed;

  // Determine overall status
  let status: SystemHealth['status'] = 'healthy';
  if (successRate < 0.7 || queueSize > 50) {
    status = 'down';
  } else if (successRate < 0.9 || queueSize > 10) {
    status = 'degraded';
  }

  return {
    status,
    successRate,
    totalOperations: opsResult.count,
    avgQualityScore: qualityResult.avg || 0,
    postsCorrected: correctedResult.count,
    postsRejected: rejectedResult.count,
    queueSize,
    lastUpdated: new Date().toISOString()
  };
}

/**
 * Get operation statistics for a specific client
 */
export function getClientStats(clientId: number): {
  totalOperations: number;
  totalPosts: number;
  successRate: number;
  avgQualityScore: number;
} {
  const db = getOperationsDb();

  const opsResult = db.prepare(`
    SELECT COUNT(*) as count FROM operations WHERE client_id = ?
  `).get(clientId) as { count: number };

  const postsResult = db.prepare(`
    SELECT COUNT(*) as count FROM posts WHERE client_id = ?
  `).get(clientId) as { count: number };

  const sentResult = db.prepare(`
    SELECT COUNT(*) as count FROM posts WHERE client_id = ? AND status = 'sent'
  `).get(clientId) as { count: number };

  const qualityResult = db.prepare(`
    SELECT AVG(quality_score) as avg FROM posts WHERE client_id = ?
  `).get(clientId) as { avg: number | null };

  return {
    totalOperations: opsResult.count,
    totalPosts: postsResult.count,
    successRate: postsResult.count > 0 ? sentResult.count / postsResult.count : 1,
    avgQualityScore: qualityResult.avg || 0
  };
}

/**
 * Close the operations database
 */
export function closeOperationsDb(): void {
  if (opsDb) {
    opsDb.close();
    opsDb = null;
    console.log('Operations database connection closed');
  }
}
