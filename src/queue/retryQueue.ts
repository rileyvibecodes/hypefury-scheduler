/**
 * Retry Queue Management
 *
 * Handles queueing failed posts for retry with exponential backoff.
 * Integrates with the operations database for persistence.
 */

import {
  getPostById,
  markPostFailed,
  markPostPermanentlyFailed,
  markPostSent,
  getPostsDueForRetry,
  getQueueStatus,
  Post
} from '../db/operations.js';

// ============================================
// Configuration
// ============================================

// Retry delays in seconds (exponential backoff)
export const RETRY_DELAYS = [
  30,      // 30 seconds
  60,      // 1 minute
  120,     // 2 minutes
  300,     // 5 minutes
  600,     // 10 minutes
  1800,    // 30 minutes
  3600     // 1 hour
];

export const MAX_RETRIES = RETRY_DELAYS.length;

// ============================================
// Queue Interface
// ============================================

export interface QueuedPost {
  id: number;
  operationId: number;
  clientId: number;
  content: string;
  retryCount: number;
  nextRetryAt: Date;
}

// ============================================
// Queue Functions
// ============================================

/**
 * Add a post to the retry queue
 * Calculates next retry time based on exponential backoff
 */
export function addToRetryQueue(postId: number, errorMessage: string): boolean {
  const post = getPostById(postId);
  if (!post) {
    console.error(`[RetryQueue] Post ${postId} not found`);
    return false;
  }

  const newRetryCount = post.retry_count + 1;

  // Check if max retries exceeded
  if (newRetryCount > MAX_RETRIES) {
    console.log(`[RetryQueue] Post ${postId} exceeded max retries (${MAX_RETRIES}), marking as permanently failed`);
    markPostPermanentlyFailed(postId, `Max retries (${MAX_RETRIES}) exceeded. Last error: ${errorMessage}`);
    return false;
  }

  // Calculate delay based on retry count
  const delayIndex = Math.min(newRetryCount - 1, RETRY_DELAYS.length - 1);
  const delaySeconds = RETRY_DELAYS[delayIndex];
  const nextRetryAt = new Date(Date.now() + delaySeconds * 1000);

  // Update post with retry info
  markPostFailed(postId, errorMessage, nextRetryAt);

  console.log(`[RetryQueue] Post ${postId} queued for retry #${newRetryCount} at ${nextRetryAt.toISOString()} (delay: ${delaySeconds}s)`);

  return true;
}

/**
 * Get posts that are due for retry
 */
export function getRetryablePosts(limit: number = 10): QueuedPost[] {
  const posts = getPostsDueForRetry(limit);

  return posts.map(post => ({
    id: post.id,
    operationId: post.operation_id,
    clientId: post.client_id,
    content: post.processed_content,
    retryCount: post.retry_count,
    nextRetryAt: new Date(post.next_retry_at!)
  }));
}

/**
 * Mark a post as successfully sent
 */
export function markRetrySuccess(postId: number, response: string): void {
  markPostSent(postId, response);
  console.log(`[RetryQueue] Post ${postId} sent successfully after retry`);
}

/**
 * Get current queue status
 */
export function getRetryQueueStatus(): {
  pending: number;
  awaitingRetry: number;
  permanentlyFailed: number;
  total: number;
} {
  const status = getQueueStatus();

  return {
    pending: status.pending,
    awaitingRetry: status.failed,
    permanentlyFailed: status.permanentlyFailed,
    total: status.pending + status.failed + status.permanentlyFailed
  };
}

/**
 * Calculate time until next retry for a post
 */
export function getTimeUntilRetry(post: Post): number | null {
  if (post.status !== 'failed' || !post.next_retry_at) {
    return null;
  }

  const nextRetry = new Date(post.next_retry_at).getTime();
  const now = Date.now();

  return Math.max(0, nextRetry - now);
}

/**
 * Format retry delay for display
 */
export function formatRetryDelay(delayMs: number): string {
  const seconds = Math.floor(delayMs / 1000);

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes > 0) {
    return `${hours}h ${remainingMinutes}m`;
  }

  return `${hours}h`;
}
