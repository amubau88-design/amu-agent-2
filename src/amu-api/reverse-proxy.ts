import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../shared/logger.ts';
import { localProjectManager } from '../projects/local-project-manager.ts';

export interface ReverseProxyConfig {
  httpPort: number;
  httpsPort: number;
  targetCorePort: number;
  domain: string;
  enableHttps: boolean;
}

export class LocalDomainProxy {
  private config: ReverseProxyConfig;
  private httpServer: http.Server | null = null;
  private httpsServer: https.Server | null = null;

  constructor(config: Partial<ReverseProxyConfig> = {}) {
    this.config = {
      httpPort: config.httpPort ?? 80,
      httpsPort: config.httpsPort ?? 443,
      targetCorePort: config.targetCorePort ?? 3000,
      domain: config.domain ?? 'agent2.amu.test',
      enableHttps: config.enableHttps ?? true,
    };
  }

  private resolveTargetPort(hostHeader?: string): number {
    if (!hostHeader) return this.config.targetCorePort;
    const cleanHost = hostHeader.split(':')[0].toLowerCase();

    // Check if target is a registered local project subdomain (e.g., myproject.amu.test or myproject.amu.local)
    for (const project of localProjectManager.listProjects()) {
      if (cleanHost === project.localHostname.toLowerCase() || 
          cleanHost === `${project.id}.amu.test` || 
          cleanHost === `${project.id}.amu.local`) {
        return project.port;
      }
    }

    // Default: routes to AMU-Agent-2 core engine
    return this.config.targetCorePort;
  }

  private handleProxyRequest(req: http.IncomingMessage, res: http.ServerResponse, isHttps: boolean = false) {
    const targetPort = this.resolveTargetPort(req.headers.host);
    const hostHeader = req.headers.host || this.config.domain;

    const proxyHeaders = {
      ...req.headers,
      'x-forwarded-for': req.socket.remoteAddress || '127.0.0.1',
      'x-forwarded-proto': isHttps ? 'https' : 'http',
      'x-forwarded-host': hostHeader,
    };

    const proxyReq = http.request({
      hostname: '127.0.0.1',
      port: targetPort,
      path: req.url || '/',
      method: req.method,
      headers: proxyHeaders,
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      logger.error(`Proxy-Fehler für ${req.method} ${req.url} -> 127.0.0.1:${targetPort}: ${err.message}`);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: {
            code: 'BAD_GATEWAY',
            message: `Zielserver auf Port ${targetPort} antwortet nicht: ${err.message}`,
            hint: targetPort === this.config.targetCorePort 
              ? 'AMU-Agent-2 Core Server ist eventuell noch nicht bereit.' 
              : `Projekt auf Port ${targetPort} ist eventuell gestoppt. Bitte im Dashboard starten.`,
          }
        }, null, 2));
      }
    });

    req.pipe(proxyReq);
  }

  public async start(): Promise<{ httpStarted: boolean; httpsStarted: boolean }> {
    let httpStarted = false;
    let httpsStarted = false;

    // 1. Start HTTP Proxy on Port 80
    try {
      this.httpServer = http.createServer((req, res) => {
        this.handleProxyRequest(req, res, false);
      });

      await new Promise<void>((resolve, reject) => {
        this.httpServer?.listen(this.config.httpPort, '0.0.0.0', () => {
          logger.info(`🌐 Lokaler Reverse Proxy aktiv auf http://${this.config.domain} (Port ${this.config.httpPort}) -> Port ${this.config.targetCorePort}`);
          httpStarted = true;
          resolve();
        });
        this.httpServer?.on('error', (err) => {
          logger.warn(`Port ${this.config.httpPort} konnte nicht gebunden werden (${err.message}). HTTP Proxy wird übersprungen.`);
          resolve(); // Non-blocking
        });
      });
    } catch (err: unknown) {
      logger.warn(`Fehler beim Starten des HTTP-Proxys: ${(err as Error).message}`);
    }

    // 2. Start HTTPS Proxy on Port 443 (with local test cert)
    if (this.config.enableHttps) {
      try {
        const pfxPath = path.resolve(process.cwd(), 'scratch', 'agent2-amu-test.pfx');
        if (fs.existsSync(pfxPath)) {
          const pfxBuffer = fs.readFileSync(pfxPath);
          this.httpsServer = https.createServer({
            pfx: pfxBuffer,
            passphrase: 'amu-test-pwd',
          }, (req, res) => {
            this.handleProxyRequest(req, res, true);
          });

          await new Promise<void>((resolve) => {
            this.httpsServer?.listen(this.config.httpsPort, '0.0.0.0', () => {
              logger.info(`🔒 Lokaler HTTPS Reverse Proxy aktiv auf https://${this.config.domain} (Port ${this.config.httpsPort}) -> Port ${this.config.targetCorePort}`);
              httpsStarted = true;
              resolve();
            });
            this.httpsServer?.on('error', (err) => {
              logger.warn(`Port ${this.config.httpsPort} konnte nicht gebunden werden (${err.message}). HTTPS Proxy wird übersprungen.`);
              resolve(); // Non-blocking
            });
          });
        }
      } catch (err: unknown) {
        logger.warn(`Fehler beim Starten des HTTPS-Proxys: ${(err as Error).message}`);
      }
    }

    return { httpStarted, httpsStarted };
  }

  public async stop(): Promise<void> {
    if (this.httpServer) {
      await new Promise<void>((resolve) => this.httpServer?.close(() => resolve()));
      this.httpServer = null;
    }
    if (this.httpsServer) {
      await new Promise<void>((resolve) => this.httpsServer?.close(() => resolve()));
      this.httpsServer = null;
    }
  }
}

export const localDomainProxy = new LocalDomainProxy();
