const defaultApiUrl =
  typeof window !== 'undefined' && window.location.origin ? window.location.origin : 'http://127.0.0.1:8090';

export const env = {
  apiUrl: import.meta.env.VITE_API_URL?.trim() || defaultApiUrl,
};
