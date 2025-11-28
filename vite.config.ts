import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load environment variables based on the current mode
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    // CRITICAL: base: './' makes asset paths relative. 
    // This allows the app to run in subdirectories or on hosting where the root isn't guaranteed.
    base: './', 
    define: {
      // Polyfill process.env to prevent crashes in libraries that assume Node.js env
      'process.env': JSON.stringify({}),
      // Explicitly pass the API KEY if needed by legacy code paths
      'process.env.API_KEY': JSON.stringify(env.VITE_API_KEY || env.API_KEY),
    }
  };
});