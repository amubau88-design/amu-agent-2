import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { handleApiRequest } from './routes.ts';
import { ApiError, authenticate, requireAdmin, centralRoute, health } from '../central/service.ts';

export function createAmuApiServer(): http.Server {
  const server = http.createServer(async (req, res) => {
    const requestId = crypto.randomUUID();
    res.setHeader('X-Request-ID', requestId);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    try {
      const pathname = new URL(req.url || '/', 'http://localhost').pathname;
      if (req.method === 'GET' && ['/', '/index.html', '/admin'].includes(pathname)) {
        const filename = pathname === '/admin' ? 'admin.html' : 'index.html';
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(await fs.readFile(path.resolve('src/web-ui/public', filename), 'utf8')); return;
      }
      if (req.method === 'GET' && pathname === '/health') { res.end(JSON.stringify(await health())); return; }
      const client = authenticate(req);
      if (!pathname.startsWith('/v1/') && !pathname.startsWith('/api/central/')) requireAdmin(client);
      let body: any = null;
      if (['POST', 'PUT', 'PATCH'].includes(req.method || '')) {
        const chunks: Buffer[] = []; let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 1024 * 1024) throw new ApiError(413, 'Request body exceeds 1 MiB');
          chunks.push(chunk);
        }
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new ApiError(400, 'Invalid JSON'); }
      }
      if (await centralRoute(req, res, pathname, body, client)) return;
      if (pathname.startsWith('/v1/')) throw new ApiError(404, 'Unknown OpenAI endpoint');
      const result = await handleApiRequest(req.method || 'GET', pathname, body, { requestId, correlationId: requestId, apiKey: client.id });
      res.writeHead(result.statusCode); res.end(JSON.stringify(result.response));
    } catch (error) {
      if (res.destroyed) return;
      if (res.headersSent) { res.end('data: {"error":{"message":"Inference stream interrupted","type":"server_error"}}\n\ndata: [DONE]\n\n'); return; }
      const status = error instanceof ApiError ? error.status : (error as Error).name === 'TimeoutError' ? 504 : 503;
      res.writeHead(status);
      res.end(JSON.stringify({ error: { message: error instanceof ApiError ? error.message : 'Local inference or service unavailable', type: status < 500 ? 'invalid_request_error' : 'server_error', code: String(status) }, requestId }));
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  return server;
}
export function startServer(port = Number(process.env.PORT) || 3030): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const server = createAmuApiServer();
    server.once('error', reject);
    server.listen(port, process.env.AMU_BIND_HOST || '127.0.0.1', () => { console.log(`AMU API listening on ${JSON.stringify(server.address())}`); resolve(server); });
  });
}

