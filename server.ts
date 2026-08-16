import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;

// Need to handle raw body for JSON since the fetch handlers use req.json()
// Actually it's easier to just pass the request into a Request object.

async function createWebRequest(req: express.Request): Promise<Request> {
  const url = `http://${req.headers.host}${req.url}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      value.forEach(v => headers.append(key, v));
    } else if (value) {
      headers.set(key, value);
    }
  }
  
  const init: RequestInit = {
    method: req.method,
    headers,
  };
  
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = req.body; // Will pass raw buffer
  }
  
  return new Request(url, init);
}

async function sendWebResponse(res: express.Response, webRes: Response) {
  res.status(webRes.status);
  webRes.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  const text = await webRes.text();
  res.send(text);
}

// We need to parse raw body
app.use(express.raw({ type: '*/*' }));

async function startServer() {
  // Mount Netlify functions
  const routes = [
    'create-invoice',
    'matchmaking',
    'night-siege',
    'referrals',
    'smugglers-run',
    'sync',
    'syndicates',
    'verify-channel',
    'telegram-webhook',
    'leaderboard'
  ];

  for (const route of routes) {
    const module = await import(`./netlify/functions/${route}.mts`);
    app.all(`/api/${route}`, async (req, res) => {
      try {
        const webReq = await createWebRequest(req);
        const webRes = await module.default(webReq);
        await sendWebResponse(res, webRes);
      } catch (err) {
        console.error(`Error in /api/${route}:`, err);
        res.status(500).send('Internal Server Error');
      }
    });
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
