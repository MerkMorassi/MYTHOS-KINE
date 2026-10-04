
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        fs: {
            allow: ['.']
        }
      },
      plugins: [
        react(),
        {
          name: 'api-internal-middleware',
          configureServer(server) {
            server.middlewares.use((req, res, next) => {
              if (req.url && req.url.startsWith('/api/')) {
                res.setHeader('Content-Type', 'application/json');
                if (req.url.startsWith('/api/analyze-audio-sentiment-themes')) {
                  res.end(JSON.stringify({
                    overallSentiment: { dominant: 'Tense & Dramatic', positive: 20, neutral: 25, tenseOrNegative: 40, mysterious: 15 },
                    plotThemes: [],
                    summary: 'Audio transcripts analyzed successfully.'
                  }));
                  return;
                }
                if (req.url.startsWith('/api/batch-categorize')) {
                  res.end(JSON.stringify({ mappings: {} }));
                  return;
                }
                if (req.url.startsWith('/api/sync')) {
                  res.end(JSON.stringify({ success: true, timestamp: Date.now() }));
                  return;
                }
                if (req.url.startsWith('/api/auto-tag')) {
                  res.end(JSON.stringify({ tags: ['cinematic', 'lore', 'asset'] }));
                  return;
                }
                if (req.url.startsWith('/api/embed-batch')) {
                  res.end(JSON.stringify({ embeddings: [] }));
                  return;
                }
                if (req.url.startsWith('/api/extract-metadata')) {
                  res.end(JSON.stringify({ summary: 'Asset indexed', tags: ['lore'], category: 'Root Documents' }));
                  return;
                }
                if (req.url.startsWith('/api/detect-contradictions')) {
                  res.end(JSON.stringify({ discrepancies: [] }));
                  return;
                }
                if (req.url.startsWith('/api/music/')) {
                  res.end(JSON.stringify({ taskId: 'task_complete', status: 'completed' }));
                  return;
                }
                res.end(JSON.stringify({ success: true }));
                return;
              }
              next();
            });
          }
        }
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || env.API_KEY || ''),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || env.API_KEY || '')
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
          target: 'esnext',
          modulePreload: true,
          outDir: 'dist',
          rollupOptions: {
              input: {
                  main: path.resolve(__dirname, 'index.html'),
              }
          }
      }
    };
});
