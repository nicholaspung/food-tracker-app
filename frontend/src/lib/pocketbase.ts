import PocketBase from 'pocketbase';

// Create a single PocketBase instance for the entire application
// Use environment variable for API URL, fallback to localhost for dev
const apiUrl = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8090';
export const pb = new PocketBase(apiUrl);

// Enable auto cancellation for pending requests
pb.autoCancellation(false);

// Export types for user authentication
export interface AuthData {
  email: string;
  password: string;
}

export interface SignUpData extends AuthData {
  passwordConfirm: string;
}

export interface User {
  id: string;
  email: string;
  verified: boolean;
  created: string;
  updated: string;
}
