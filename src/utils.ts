import fetch from 'node-fetch';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export const HF_BASE_URL = "https://app.hypefury.com";
export const HF_AUTH_ENDPOINT = `${HF_BASE_URL}/api/externalApps/auth`;
export const HF_SCHEDULE_ENDPOINT = `${HF_BASE_URL}/api/externalApps/posts/save`;
export const HF_PARTNER_KEY = "NjhiNGQ1NWItOWFjNi00MDlkLWI2MjktNjhkNTk5OTNkZWQz";

// Read API key lazily to ensure dotenv has loaded
export function getApiKey(): string | undefined {
  return process.env.HF_API_KEY;
}

/**
 * Makes requests to the Hypefury API
 * @param url The API endpoint URL
 * @param body Optional request body for POST requests
 * @returns API response data
 */
export async function makeHfRequest(url: string, body?: string) {
    const apiKey = getApiKey();
    console.log(`Making request to ${url}`);
    if (!apiKey) {
        console.error('HF_API_KEY is not defined');
        return {
            statusCode: 500,
            message: 'API key is missing',
        };
    }

    const headers = {
        "Authorization": `Bearer ${HF_PARTNER_KEY}:${apiKey}`,
        "Content-Type": "application/json"
    };

    console.error(`Making request to ${url}`);
    
    try {
        let response;
        if (body) {
            console.error('POST request with body');
            response = await fetch(url, {
                method: 'POST',
                headers, 
                body,
                timeout: 30000
            });
        } else {
            console.error('GET request');
            response = await fetch(url, {
                method: 'GET',
                headers,
                timeout: 30000
            });
        }

        console.error(`Response status: ${response.status}`);
        const responseText = await response.text();
        
        try {
            return {
                statusCode: response.status,
                message: responseText || null
            };
        } catch (error) {
            console.error('Error handling response:', error);
            return {
                statusCode: response.status,
                message: null
            };
        }
    } catch (error) {
        console.error('Network error in makeHfRequest:', error);
        return {
            statusCode: 500,
            message: `Network error: ${error instanceof Error ? error.message : String(error)}`,
        };
    }
} 