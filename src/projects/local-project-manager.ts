import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { SecurityGuard, DEFAULT_PERMISSIONS } from '../shared/security.ts';
import { StructuredLogger } from '../shared/logger.ts';

const security = new SecurityGuard(DEFAULT_PERMISSIONS);
const logger = new StructuredLogger('project-manager', 'local-servers');

export interface LocalProject {
  id: string;
  name: string;
  projectPath: string;
  port: number;
  localHostname: string; // e.g. project-1.amu.local or project-1.amu.test
  localUrl: string;      // e.g. http://localhost:PORT
  status: 'stopped' | 'running' | 'error';
  startedAt?: string;
  pid?: number;
  type: 'static' | 'api' | 'fullstack';
}

export class LocalProjectManager {
  private projects: Map<string, LocalProject> = new Map();
  private runningServers: Map<string, http.Server> = new Map();
  private basePort = 3100;

  constructor() {
    this.registerSampleProject();
    this.discoverExistingProjects();
  }

  private registerSampleProject(): void {
    const sampleDir = path.resolve(process.cwd(), 'scratch', 'projects', 'demo-app');
    this.projects.set('demo-app', {
      id: 'demo-app',
      name: 'Demo Web-App',
      projectPath: sampleDir,
      port: 3101,
      localHostname: 'demo-app.amu.local',
      localUrl: 'http://localhost:3101',
      status: 'stopped',
      type: 'static',
    });
  }

  private async discoverExistingProjects(): Promise<void> {
    try {
      const baseDir = path.resolve(process.cwd(), 'scratch', 'projects');
      if (!existsSync(baseDir)) return;
      const entries = await fs.readdir(baseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name !== 'demo-app') {
          const projPath = path.join(baseDir, entry.name);
          const hasServer = existsSync(path.join(projPath, 'src', 'server.ts'));
          const type = hasServer ? 'api' : 'static';
          const name = entry.name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          this.registerProject(entry.name, name, projPath, type);
        }
      }
    } catch {
      // Best-effort auto discovery
    }
  }

  public listProjects(): LocalProject[] {
    try {
      const baseDir = path.resolve(process.cwd(), 'scratch', 'projects');
      if (existsSync(baseDir)) {
        const entries = readdirSync(baseDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && entry.name !== 'demo-app' && !this.projects.has(entry.name)) {
            const projPath = path.join(baseDir, entry.name);
            const hasServer = existsSync(path.join(projPath, 'src', 'server.ts'));
            const type = hasServer ? 'fullstack' : 'static';
            const name = entry.name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            this.registerProject(entry.name, name, projPath, type);
          }
        }
      }
    } catch {
      // Best effort
    }
    return Array.from(this.projects.values());
  }

  public getProject(id: string): LocalProject | undefined {
    return this.projects.get(id);
  }

  public registerProject(id: string, name: string, projectPath: string, type: 'static' | 'api' | 'fullstack' = 'static'): LocalProject {
    const existing = this.projects.get(id);
    if (existing) {
      existing.projectPath = projectPath;
      existing.type = type;
      return existing;
    }

    const port = this.allocateNextPort();
    const project: LocalProject = {
      id,
      name,
      projectPath,
      port,
      localHostname: `${id}.amu.test`,
      localUrl: `http://localhost:${port}`,
      status: 'stopped',
      type,
    };
    this.projects.set(id, project);
    logger.info(`Projekt '${name}' (${id}) registriert auf Port ${port}`);
    return project;
  }

  public async createProject(name: string, type: 'static' | 'api' | 'fullstack' = 'static'): Promise<LocalProject> {
    const id = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const targetDir = path.resolve(process.cwd(), 'scratch', 'projects', id);
    security.validatePathAccess(targetDir, 'write');

    await fs.mkdir(targetDir, { recursive: true });

    const indexPath = path.join(targetDir, 'index.html');
    if (!existsSync(indexPath)) {
      const indexHtml = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>${name} | AMU Local App</title>
  <style>body { font-family: sans-serif; background: #0f172a; color: #f8fafc; padding: 40px; text-align: center; } h1 { color: #38bdf8; }</style>
</head>
<body>
  <h1>${name}</h1>
  <p>Erstellt und isoliert verwaltet durch AMU-Agent-2 Entwickler-Engine.</p>
  <p>Lokale Entwicklungsadresse: <code>http://localhost:${this.allocateNextPort()}</code></p>
</body>
</html>`;
      await fs.writeFile(indexPath, indexHtml, 'utf-8');
    }

    return this.registerProject(id, name, targetDir, type);
  }

  public async startProject(id: string): Promise<{ success: boolean; message: string; url?: string }> {
    const project = this.projects.get(id);
    if (!project) return { success: false, message: `Projekt '${id}' nicht gefunden.` };

    if (project.status === 'running') {
      return { success: true, message: 'Projekt läuft bereits.', url: project.localUrl };
    }

    try {
      // Attempt to load custom app handler if src/server.ts exists
      let customAppHandler: http.Server | null = null;
      const serverFile = path.join(project.projectPath, 'src', 'server.ts');
      if (existsSync(serverFile)) {
        try {
          const mod = await import(pathToFileURL(serverFile).href + `?t=${Date.now()}`);
          if (typeof mod.createMicroserviceApp === 'function') {
            customAppHandler = mod.createMicroserviceApp();
          } else if (typeof mod.createApp === 'function') {
            customAppHandler = mod.createApp();
          } else if (typeof mod.createPortalApp === 'function') {
            customAppHandler = mod.createPortalApp();
          }
        } catch (e) {
          logger.warn(`Konnte benutzerdefiniertes Modul für '${id}' nicht dynamisch laden: ${(e as Error).message}`);
        }
      }

      const server = http.createServer(async (req, res) => {
        try {
          const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
          const pathname = parsedUrl.pathname;

          // If custom application handler exists and route is an API route or /health:
          if (customAppHandler && (pathname.startsWith('/api/') || pathname === '/health' || pathname === '/stats')) {
            customAppHandler.emit('request', req, res);
            return;
          }

          // Fallback static file serving
          let reqFile = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
          
          // Check public/ directory first, then root directory
          let targetFile = path.join(project.projectPath, 'public', reqFile);
          if (!existsSync(targetFile)) {
            targetFile = path.join(project.projectPath, reqFile);
          }

          if (existsSync(targetFile)) {
            security.validatePathAccess(targetFile, 'read');
            const stat = await fs.stat(targetFile);
            if (stat.isFile()) {
              const content = await fs.readFile(targetFile);
              const ext = path.extname(targetFile).toLowerCase();
              const mimeMap: Record<string, string> = {
                '.html': 'text/html; charset=utf-8',
                '.json': 'application/json; charset=utf-8',
                '.js': 'application/javascript; charset=utf-8',
                '.css': 'text/css; charset=utf-8',
                '.svg': 'image/svg+xml',
                '.png': 'image/png',
                '.ico': 'image/x-icon',
              };
              res.writeHead(200, { 'Content-Type': mimeMap[ext] || 'text/plain; charset=utf-8' });
              res.end(content);
              return;
            }
          }

          // Built-in health check if not found
          if (pathname === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              status: 'UP',
              project: project.name,
              id: project.id,
              port: project.port,
              type: project.type,
              timestamp: new Date().toISOString()
            }));
            return;
          }

          // Not found
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'File or Route Not Found in Local Project' }));
        } catch (err: unknown) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: `Server Error: ${(err as Error).message}` }));
        }
      });

      await new Promise<void>((resolve, reject) => {
        server.listen(project.port, '0.0.0.0', () => resolve());
        server.on('error', reject);
      });

      this.runningServers.set(id, server);
      project.status = 'running';
      project.startedAt = new Date().toISOString();

      return {
        success: true,
        message: `Projekt '${project.name}' erfolgreich gestartet auf Port ${project.port}.`,
        url: project.localUrl,
      };
    } catch (err: unknown) {
      project.status = 'error';
      return { success: false, message: `Fehler beim Starten: ${(err as Error).message}` };
    }
  }

  public async autoStartProjects(): Promise<void> {
    for (const project of this.listProjects()) {
      if (existsSync(project.projectPath) && (project.id === 'kunden-portal' || project.id === 'baustellen-manager')) {
        try {
          await this.startProject(project.id);
          logger.info(`Projekt '${project.name}' beim Serverstart automatisch gestartet auf Port ${project.port}.`);
        } catch (e) {
          logger.warn(`Konnte '${project.name}' beim Start nicht auto-starten: ${(e as Error).message}`);
        }
      }
    }
  }

  public async stopProject(id: string): Promise<{ success: boolean; message: string }> {
    const project = this.projects.get(id);
    if (!project) return { success: false, message: `Projekt '${id}' nicht gefunden.` };

    const server = this.runningServers.get(id);
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      this.runningServers.delete(id);
    }

    project.status = 'stopped';
    project.startedAt = undefined;
    return { success: true, message: `Projekt '${project.name}' angehalten.` };
  }

  private allocateNextPort(): number {
    const usedPorts = Array.from(this.projects.values()).map(p => p.port);
    let port = this.basePort;
    while (usedPorts.includes(port)) {
      port++;
    }
    return port;
  }
}

export const localProjectManager = new LocalProjectManager();
