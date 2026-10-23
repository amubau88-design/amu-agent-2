import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { repoIndexer } from './repo-indexer.ts';
import { SecurityGuard, DEFAULT_PERMISSIONS } from '../shared/security.ts';
import { StructuredLogger } from '../shared/logger.ts';

const security = new SecurityGuard(DEFAULT_PERMISSIONS);
const logger = new StructuredLogger('project-analyzer', 'context');

export interface ProjectAnalysisReport {
  projectPath: string;
  projectName: string;
  technologies: string[];
  packageInfo?: {
    name?: string;
    version?: string;
    dependencies: string[];
    devDependencies: string[];
    scripts: string[];
  };
  structure: {
    totalFiles: number;
    directories: string[];
    hasFrontend: boolean;
    hasBackend: boolean;
    hasTests: boolean;
    hasDatabase: boolean;
  };
  apiEndpointsDetected: Array<{ method: string; path: string; file: string }>;
  databaseEntities: Array<{ name: string; file: string }>;
  frontendComponents: Array<{ name: string; file: string; type: 'html' | 'react' | 'vue' | 'vanilla' }>;
  impactPrediction: {
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    potentialBreakages: string[];
    suggestedSteps: string[];
  };
}

export class ProjectAnalyzer {
  public async analyzeProject(targetPath: string = process.cwd(), plannedChangeDescription?: string): Promise<ProjectAnalysisReport> {
    const resolvedPath = path.resolve(targetPath);
    security.validatePathAccess(resolvedPath, 'read');
    logger.info(`Analyzing project structure at ${resolvedPath}`);

    const projectName = path.basename(resolvedPath);
    const technologies: Set<string> = new Set();
    const directories: Set<string> = new Set();
    const apiEndpoints: Array<{ method: string; path: string; file: string }> = [];
    const databaseEntities: Array<{ name: string; file: string }> = [];
    const frontendComponents: Array<{ name: string; file: string; type: 'html' | 'react' | 'vue' | 'vanilla' }> = [];

    // 1. Check package.json
    let packageInfo: ProjectAnalysisReport['packageInfo'] | undefined;
    const pkgPath = path.join(resolvedPath, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkgRaw = await fs.readFile(pkgPath, 'utf-8');
        const pkg = JSON.parse(pkgRaw);
        packageInfo = {
          name: pkg.name,
          version: pkg.version,
          dependencies: Object.keys(pkg.dependencies || {}),
          devDependencies: Object.keys(pkg.devDependencies || {}),
          scripts: Object.keys(pkg.scripts || {}),
        };
        technologies.add('Node.js');
        if (pkg.dependencies?.express || pkg.devDependencies?.express) technologies.add('Express');
        if (pkg.devDependencies?.typescript || pkg.dependencies?.typescript) technologies.add('TypeScript');
      } catch {
        // Skip malformed package.json
      }
    }

    // 2. Scan Directory Structure & Files
    const allFiles: string[] = [];
    await this.collectFiles(resolvedPath, resolvedPath, allFiles, directories);

    let hasFrontend = false;
    let hasBackend = false;
    let hasTests = false;
    let hasDatabase = false;

    for (const relFile of allFiles) {
      const fullPath = path.join(resolvedPath, relFile);
      const ext = path.extname(relFile).toLowerCase();

      // Technology detection
      if (ext === '.ts' || ext === '.tsx') technologies.add('TypeScript');
      if (ext === '.js' || ext === '.jsx') technologies.add('JavaScript');
      if (ext === '.html') technologies.add('HTML5');
      if (ext === '.css') technologies.add('CSS3');

      // Test detection
      if (relFile.includes('test') || relFile.includes('spec')) {
        hasTests = true;
      }

      // Read file content for deeper semantic inspection (limited size)
      try {
        const stat = await fs.stat(fullPath);
        if (stat.size < 500000 && ['.ts', '.js', '.html', '.json'].includes(ext)) {
          const content = await fs.readFile(fullPath, 'utf-8');

          // Backend & API detection
          if (content.includes('http.createServer') || content.includes('express()') || content.includes('app.get') || content.includes('app.post')) {
            hasBackend = true;
          }

          // Regex search for API endpoints
          const routeRegex = /(?:app|router|server)\.(get|post|put|delete|patch)\(\s*['"`]([^'"`]+)['"`]/gi;
          let match: RegExpExecArray | null;
          while ((match = routeRegex.exec(content)) !== null) {
            apiEndpoints.push({
              method: match[1].toUpperCase(),
              path: match[2],
              file: relFile,
            });
          }

          // Custom pathname checks (e.g. url.pathname === '/api/...')
          const customUrlRegex = /url\.pathname\s*===\s*['"`]([^'"`]+)['"`]/g;
          while ((match = customUrlRegex.exec(content)) !== null) {
            const matchedPath = match[1];
            if (!apiEndpoints.some(e => e.path === matchedPath)) {
              apiEndpoints.push({
                method: 'GET/POST',
                path: match[1],
                file: relFile,
              });
            }
          }

          // Database & Entity detection
          if (content.includes('interface ') || content.includes('type ') || content.includes('class ')) {
            const entityMatch = /(?:interface|class)\s+([A-Z][a-zA-Z0-9]+)\s*(?:extends|\{|implements)/g;
            let em;
            while ((em = entityMatch.exec(content)) !== null) {
              const entityName = em[1];
              if (!['Error', 'Promise', 'Request', 'Response'].includes(entityName)) {
                if (content.toLowerCase().includes('db') || content.toLowerCase().includes('store') || content.toLowerCase().includes('repository')) {
                  databaseEntities.push({ name: entityName, file: relFile });
                  hasDatabase = true;
                }
              }
            }
          }

          // Frontend detection
          if (ext === '.html') {
            hasFrontend = true;
            frontendComponents.push({
              name: path.basename(relFile),
              file: relFile,
              type: 'html',
            });
          }
        }
      } catch {
        // Skip unreadable files safely
      }
    }

    // 3. Impact Prediction
    const potentialBreakages: string[] = [];
    const suggestedSteps: string[] = [];
    let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';

    if (plannedChangeDescription) {
      const lowerChange = plannedChangeDescription.toLowerCase();
      if (lowerChange.includes('delete') || lowerChange.includes('drop') || lowerChange.includes('löschen')) {
        riskLevel = 'HIGH';
        potentialBreakages.push('Möglicher Datenverlust bei Löschoperationen. Zwingend Checkpoint erstellen!');
      } else if (lowerChange.includes('api') || lowerChange.includes('datenbank') || lowerChange.includes('schema')) {
        riskLevel = 'MEDIUM';
        potentialBreakages.push('API-Schema-Änderung kann bestehende Frontend-Clients beeinträchtigen.');
        suggestedSteps.push('1. API-Routen synchron mit Frontend anpassen.');
        suggestedSteps.push('2. Automatisierte Integrationstests für alle Endpunkte ausführen.');
      } else {
        suggestedSteps.push('1. Modul isoliert ändern.');
        suggestedSteps.push('2. Syntax- & Regressionstests durchführen.');
      }
    }

    if (!suggestedSteps.length) {
      suggestedSteps.push('Architekturanalyse validiert. Modulare Schritte ausführen.');
    }

    return {
      projectPath: resolvedPath,
      projectName,
      technologies: Array.from(technologies),
      packageInfo,
      structure: {
        totalFiles: allFiles.length,
        directories: Array.from(directories),
        hasFrontend,
        hasBackend,
        hasTests,
        hasDatabase,
      },
      apiEndpointsDetected: apiEndpoints,
      databaseEntities: databaseEntities.slice(0, 10),
      frontendComponents,
      impactPrediction: {
        riskLevel,
        potentialBreakages,
        suggestedSteps,
      },
    };
  }

  private async collectFiles(rootDir: string, currentDir: string, files: string[], dirs: Set<string>, depth = 0): Promise<void> {
    if (depth > 5) return;
    const ignoreDirs = ['node_modules', '.git', 'dist', 'coverage', '.gemini', 'brain', 'backup'];

    try {
      const items = await fs.readdir(currentDir, { withFileTypes: true });
      for (const item of items) {
        if (ignoreDirs.includes(item.name)) continue;
        const fullPath = path.join(currentDir, item.name);
        const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');

        if (item.isDirectory()) {
          dirs.add(relPath);
          await this.collectFiles(rootDir, fullPath, files, dirs, depth + 1);
        } else if (item.isFile()) {
          files.push(relPath);
        }
      }
    } catch {
      // Best-effort
    }
  }
}

export const projectAnalyzer = new ProjectAnalyzer();
