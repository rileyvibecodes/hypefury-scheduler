/**
 * Retry Worker
 *
 * Background processor that periodically checks for failed posts
 * and retries them with exponential backoff.
 */

import {
  getRetryablePosts,
  addToRetryQueue,
  markRetrySuccess,
  getRetryQueueStatus
} from './retryQueue.js';
import { makeHfRequest, HF_SCHEDULE_ENDPOINT } from '../utils.js';
import { getClientById } from '../db/database.js';

// ============================================
// Configuration
// ============================================

const WORKER_INTERVAL_MS = 15000; // Check every 15 seconds
const BATCH_SIZE = 5; // Process up to 5 posts per cycle
const DELAY_BETWEEN_RETRIES_MS = 1000; // 1 second between retry attempts

// ============================================
// Worker State
// ============================================

let workerInterval: NodeJS.Timeout | null = null;
let isProcessing = false;

// ============================================
// Worker Functions
// ============================================

/**
 * Start the retry worker
 */
export function startRetryWorker(): void {
  if (workerInterval) {
    console.log('[RetryWorker] Worker already running');
    return;
  }

  console.log('[RetryWorker] Starting retry worker...');
  console.log(`[RetryWorker] Checking queue every ${WORKER_INTERVAL_MS / 1000}s`);

  // Set up interval
  workerInterval = setInterval(processRetryQueue, WORKER_INTERVAL_MS);

  // Run immediately on start
  processRetryQueue();
}

/**
 * Stop the retry worker
 */
export function stopRetryWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    console.log('[RetryWorker] Retry worker stopped');
  }
}

/**
 * Check if worker is running
 */
export function isWorkerRunning(): boolean {
  return workerInterval !== null;
}

/**
 * Process the retry queue
 */
async function processRetryQueue(): Promise<void> {
  // Prevent concurrent processing
  if (isProcessing) {
    return;
  }

  isProcessing = true;

  try {
    const posts = getRetryablePosts(BATCH_SIZE);

    if (posts.length === 0) {
      return;
    }

    console.log(`[RetryWorker] Processing ${posts.length} post(s) from retry queue...`);

    for (const post of posts) {
      await processRetryPost(post);

      // Small delay between retries to avoid rate limiting
      if (posts.indexOf(post) < posts.length - 1) {
        await sleep(DELAY_BETWEEN_RETRIES_MS);
      }
    }
  } catch (error) {
    console.error('[RetryWorker] Error processing retry queue:', error);
  } finally {
    isProcessing = false;
  }
}

/**
 * Process a single retry post
 */
async function processRetryPost(post: {
  id: number;
  operationId: number;
  clientId: number;
  content: string;
  retryCount: number;
}): Promise<void> {
  try {
    // Get client API key
    const client = getClientById(post.clientId);
    if (!client) {
      console.error(`[RetryWorker] Client ${post.clientId} not found for post ${post.id}`);
      addToRetryQueue(post.id, `Client not found: ${post.clientId}`);
      return;
    }

    console.log(`[RetryWorker] Retrying post ${post.id} (attempt ${post.retryCount + 1})`);

    // Make API request
    const response = await makeHfRequest(
      HF_SCHEDULE_ENDPOINT,
      JSON.stringify({ text: post.content }),
      client.api_key
    );

    // Check response
    if (response && (response.statusCode === 200 || response.statusCode === 201)) {
      markRetrySuccess(post.id, response.message || 'Success');
      console.log(`[RetryWorker] Post ${post.id} sent successfully on retry`);
    } else {
      const errorMsg = response?.message || `HTTP ${response?.statusCode || 'Unknown'}`;
      console.log(`[RetryWorker] Post ${post.id} retry failed: ${errorMsg}`);
      addToRetryQueue(post.id, errorMsg);
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[RetryWorker] Error retrying post ${post.id}:`, errorMsg);
    addToRetryQueue(post.id, `Exception: ${errorMsg}`);
  }
}

/**
 * Get worker status
 */
export function getWorkerStatus(): {
  running: boolean;
  processing: boolean;
  queue: {
    pending: number;
    awaitingRetry: number;
    permanentlyFailed: number;
    total: number;
  };
} {
  return {
    running: isWorkerRunning(),
    processing: isProcessing,
    queue: getRetryQueueStatus()
  };
}

/**
 * Trigger immediate queue processing (for manual retry)
 */
export async function triggerImmediateRetry(): Promise<void> {
  if (!isWorkerRunning()) {
    console.log('[RetryWorker] Worker not running, starting...');
    startRetryWorker();
    return;
  }

  console.log('[RetryWorker] Triggering immediate retry processing...');
  await processRetryQueue();
}

// ============================================
// Utility Functions
// ============================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
