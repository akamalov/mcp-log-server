/**
 * Frontend Configuration
 *
 * This file centralizes the configuration for the frontend application.
 * It provides a single source of truth for environment-dependent variables.
 */

// For the browser, we need to use NEXT_PUBLIC_ variables.
// For server-side rendering (in API routes), we can use regular variables.
// To keep things simple, we'll use one variable that works for both.
// If an .env.local file were present, it would override this.
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

export const config = {
  backendUrl: BACKEND_URL,
}; 