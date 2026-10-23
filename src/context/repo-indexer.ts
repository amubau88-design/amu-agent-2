import fs from 'node:fs/promises';
import path from 'node:path';
import { SecurityGuard, DEFAULT_PERMISSIONS } from '../shared/security.ts';

const security = new SecurityGuard(DEFAULT_PERMISSIONS);

export interface FileIndexEntry {
  relativePath: string;
  absolutePath: string;
  sizeBytes: number;
  extension: string;
  exports?: string[];
}

export interface RepoIndexSummary {
  totalFiles: number;
  totalSizeBytes: number;
  fileTree: string[];
  entries: FileIndexEntry[];
  indexedAt: string;
}

export class RepositoryIndexer {
  private rootDir: string;
  private cachedIndex: RepoIndexSummary | null = null;
  private lastIndexTime: number = 0;
  private readonly INDEX_TTL_MS = 30000;

  constructor(rootDir: string = process.cwd()) {
    this.rootDir = path.resolve(rootDir);
  }

  public invalidateCache(): void {
    this.cachedIndex = null;
  }

  public async getOrCreateIndex(forceRefresh = false): Promise<RepoIndexSummary> {
    if (!forceRefresh && this.cachedIndex && (Date.now() - this.lastIndexTime < this.INDEX_TTL_MS)) {
      return this.cachedIndex;
    }

    const entries: FileIndexEntry[] = [];
    await this.scanDirectory(this.rootDir, entries);

    const fileTree = entries.map(e => e.relativePath);
    const totalSizeBytes = entries.reduce((acc, e) => acc + e.sizeBytes, 0);

    this.cachedIndex = {
      totalFiles: entries.length,
      totalSizeBytes,
      fileTree,
      entries,
      indexedAt: new Date().toISOString(),
    };
    this.lastIndexTime = Date.now();

    return this.cachedIndex;
  }

  public async searchCode(query: string): Promise<Array<{ relativePath: string; matches: string[] }>> {
    const index = await this.getOrCreateIndex();
    const results: Array<{ relativePath: string; matches: string[] }> = [];
    const lowerQuery = query.toLowerCase();

    for (const entry of index.entries) {
      if (['.ts', '.js', '.json', '.md', '.txt'].includes(entry.extension)) {
        try {
          const content = await fs.readFile(entry.absolutePath, 'utf-8');
          const lines = content.split('\n');
          const matchingLines: string[] = [];

          lines.forEach((line, idx) => {
            if (line.toLowerCase().includes(lowerQuery)) {
              matchingLines.push(`L${idx + 1}: ${line.trim()}`);
            }
          });

          if (matchingLines.length > 0) {
            results.push({ relativePath: entry.relativePath, matches: matchingLines.slice(0, 5) });
          }
        } catch {
          // Skip unreadable files
        }
      }
    }

    return results;
  }

  public async getRelevantContextForPrompt(prompt: string): Promise<string> {
    const index = await this.getOrCreateIndex();
    const words = prompt.toLowerCase().split(/\W+/).filter(w => w.length > 3);
    
    // Find matching files based on prompt keywords
    const matchedFiles = index.entries.filter(e => {
      const name = e.relativePath.toLowerCase();
      return words.some(w => name.includes(w));
    }).slice(0, 5);

    if (matchedFiles.length === 0) {
      return `Project Summary: ${index.totalFiles} files in repository. Structure:\n${index.fileTree.slice(0, 10).join('\n')}`;
    }

    let contextText = `Relevant Project Files Identified:\n`;
    for (const file of matchedFiles) {
      try {
        const content = await fs.readFile(file.absolutePath, 'utf-8');
        const snippet = content.length > 1000 ? content.substring(0, 1000) + '\n...[truncated]' : content;
        contextText += `\n--- File: ${file.relativePath} ---\n${snippet}\n`;
      } catch {
        // Skip
      }
    }

    return contextText;
  }

  private async scanDirectory(dir: string, entries: FileIndexEntry[], depth = 0): Promise<void> {
    if (depth > 6) return;

    const ignoreDirs = ['node_modules', '.git', 'dist', 'coverage', '.gemini', 'brain', 'scratch'];
    try {
      const items = await fs.readdir(dir, { withFileTypes: true });

      for (const item of items) {
        if (ignoreDirs.includes(item.name)) continue;

        const fullPath = path.join(dir, item.name);
        const relPath = path.relative(this.rootDir, fullPath).replace(/\\/g, '/');

        if (item.isDirectory()) {
          await this.scanDirectory(fullPath, entries, depth + 1);
        } else if (item.isFile()) {
          try {
            security.validatePathAccess(fullPath, 'read');
            const stat = await fs.stat(fullPath);
            const ext = path.extname(item.name).toLowerCase();
            entries.push({
              relativePath: relPath,
              absolutePath: fullPath,
              sizeBytes: stat.size,
              extension: ext,
            });
          } catch {
            // Ignore restricted path files
          }
        }
      }
    } catch {
      // Ignore unreadable dir
    }
  }
}

export const repoIndexer = new RepositoryIndexer();
