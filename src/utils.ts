import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { AppError, ErrorCodes, mapHypefuryError } from './errors/AppError.js';

// Load environment variables
dotenv.config();

export const HF_BASE_URL = "https://app.hypefury.com";
export const HF_AUTH_ENDPOINT = `${HF_BASE_URL}/api/externalApps/auth`;
export const HF_SCHEDULE_ENDPOINT = `${HF_BASE_URL}/api/externalApps/posts/save`;
export const HF_PARTNER_KEY = "NjhiNGQ1NWItOWFjNi00MDlkLWI2MjktNjhkNTk5OTNkZWQz";

// Request timeout in milliseconds
const REQUEST_TIMEOUT = 30000;

// Read API key lazily to ensure dotenv has loaded
export function getApiKey(): string | undefined {
  return process.env.HF_API_KEY;
}

export interface HfRequestResult {
    statusCode: number;
    message: string | null;
    error?: AppError;
}

/**
 * Makes requests to the Hypefury API
 * @param url The API endpoint URL
 * @param body Optional request body for POST requests
 * @param customApiKey Optional API key to use instead of environment variable (for multi-client support)
 * @returns API response data with structured error if failed
 */
export async function makeHfRequest(url: string, body?: string, customApiKey?: string): Promise<HfRequestResult> {
    const apiKey = customApiKey || getApiKey();
    console.log(`[Hypefury API] Request to ${url}`);

    if (!apiKey) {
        console.error('[Hypefury API] API key is missing');
        const error = new AppError(ErrorCodes.AUTH_MISSING);
        return {
            statusCode: 401,
            message: null,
            error
        };
    }

    const headers = {
        "Authorization": `Bearer ${HF_PARTNER_KEY}:${apiKey}`,
        "Content-Type": "application/json"
    };

    try {
        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

        let response;
        try {
            if (body) {
                console.log('[Hypefury API] POST request');
                response = await fetch(url, {
                    method: 'POST',
                    headers,
                    body,
                    signal: controller.signal
                });
            } else {
                console.log('[Hypefury API] GET request');
                response = await fetch(url, {
                    method: 'GET',
                    headers,
                    signal: controller.signal
                });
            }
        } finally {
            clearTimeout(timeoutId);
        }

        console.log(`[Hypefury API] Response status: ${response.status}`);
        const responseText = await response.text();

        // Log auth errors for debugging
        if (response.status === 403 || response.status === 401) {
            console.log(`[Hypefury API] Auth error response: ${responseText}`);
            console.log(`[Hypefury API] API key used (last 8 chars): ...${apiKey.slice(-8)}`);
        }

        // Check for errors and create structured error object
        if (response.status >= 400) {
            const error = mapHypefuryError(response.status, responseText);
            console.error(`[Hypefury API] Error: ${error.code} - ${error.message}`);
            return {
                statusCode: response.status,
                message: responseText || null,
                error
            };
        }

        return {
            statusCode: response.status,
            message: responseText || null
        };

    } catch (error) {
        // Handle specific error types
        if (error instanceof Error) {
            if (error.name === 'AbortError') {
                console.error('[Hypefury API] Request timed out');
                const appError = new AppError(ErrorCodes.TIMEOUT);
                return {
                    statusCode: 504,
                    message: null,
                    error: appError
                };
            }

            // Network errors (ECONNREFUSED, ENOTFOUND, etc.)
            if (error.message.includes('ECONNREFUSED') ||
                error.message.includes('ENOTFOUND') ||
                error.message.includes('fetch failed')) {
                console.error(`[Hypefury API] Network error: ${error.message}`);
                const appError = new AppError(ErrorCodes.NETWORK_ERROR, error.message);
                return {
                    statusCode: 503,
                    message: null,
                    error: appError
                };
            }
        }

        console.error('[Hypefury API] Unexpected error:', error);
        const appError = new AppError(ErrorCodes.UNKNOWN,
            error instanceof Error ? error.message : String(error));
        return {
            statusCode: 500,
            message: null,
            error: appError
        };
    }
} 