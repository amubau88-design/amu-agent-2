import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { StructuredLogger } from '../shared/logger.ts';
import { SecurityGuard, DEFAULT_PERMISSIONS } from '../shared/security.ts';
import { githubService } from '../github/github-service.ts';

const logger = new StructuredLogger('version-manager', 'git-versioning');
const security = new SecurityGuard(DEFAULT_PERMISSIONS);

export interface LocalCommit {
  id: string;
  projectId: string;
  branch: string;
  message: string;
  author: string;
  timestamp: string;
  filesChanged: string[];
  snapshotDir: string;
}

export interface DiffResult {
  filePath: string;
  addedLinesCount: number;
  removedLinesCount: number;
  diffText: string;
}

export class VersionManager {
  private baseStoreDir: string;

  constructor(baseDir: string = path.resolve(process.cwd(), 'scratch', 'versioning')) {
    this.baseStoreDir = baseDir;
  }

  public async createCommit(
    projectId: string,
    message: string,
    filePaths: string[],
    branch: string = 'main',
    author: string = 'AMU-Agent-2 <agent@amu.local>'
  ): Promise<LocalCommit> {
    const commitId = `commit_${Date.now()}_${crypto.randomUUID().substring(0, 7)}`;
    const commitDir = path.join(this.baseStoreDir, projectId, 'commits', commitId);
    await fs.mkdir(commitDir, { recursive: true });

    const savedFiles: string[] = [];

    for (const file of filePaths) {
      if (existsSync(file)) {
        try {
          security.validatePathAccess(file, 'read');
          const relPath = path.basename(file);
          const dest = path.join(commitDir, relPath);
          await fs.copyFile(file, dest);
          savedFiles.push(file);
        } catch {
          // Skip unreadable
        }
      }
    }

    const commit: LocalCommit = {
      id: commitId,
      projectId,
      branch,
      message,
      author,
      timestamp: new Date().toISOString(),
      filesChanged: savedFiles,
      snapshotDir: commitDir,
    };

    // Save commit metadata
    await fs.writeFile(path.join(commitDir, 'commit.json'), JSON.stringify(commit, null, 2), 'utf-8');

    // Update branches registry
    const branchDir = path.join(this.baseStoreDir, projectId, 'branches');
    await fs.mkdir(branchDir, { recursive: true });
    await fs.writeFile(path.join(branchDir, `${branch}.head`), commitId, 'utf-8');

    logger.info(`Commit ${commitId} auf Branch '${branch}' erstellt für Projekt '${projectId}': ${message}`);
    return commit;
  }

  public async listCommits(projectId: string): Promise<LocalCommit[]> {
    const commitsDir = path.join(this.baseStoreDir, projectId, 'commits');
    if (!existsSync(commitsDir)) return [];

    const dirs = await fs.readdir(commitsDir, { withFileTypes: true });
    const commits: LocalCommit[] = [];

    for (const d of dirs) {
      if (d.isDirectory()) {
        const metaPath = path.join(commitsDir, d.name, 'commit.json');
        if (existsSync(metaPath)) {
          try {
            const raw = await fs.readFile(metaPath, 'utf-8');
            commits.push(JSON.parse(raw) as LocalCommit);
          } catch {
            // Skip corrupt
          }
        }
      }
    }

    return commits.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  public async compareCommits(projectId: string, olderCommitId: string, newerCommitId: string): Promise<DiffResult[]> {
    const cOldDir = path.join(this.baseStoreDir, projectId, 'commits', olderCommitId);
    const cNewDir = path.join(this.baseStoreDir, projectId, 'commits', newerCommitId);

    if (!existsSync(cOldDir) || !existsSync(cNewDir)) {
      return [];
    }

    const newFiles = (await fs.readdir(cNewDir)).filter(f => f !== 'commit.json');
    const diffs: DiffResult[] = [];

    for (const file of newFiles) {
      const oldFilePath = path.join(cOldDir, file);
      const newFilePath = path.join(cNewDir, file);

      const newContent = await fs.readFile(newFilePath, 'utf-8');
      const oldContent = existsSync(oldFilePath) ? await fs.readFile(oldFilePath, 'utf-8') : '';

      const oldLines = oldContent ? oldContent.split('\n') : [];
      const newLines = newContent ? newContent.split('\n') : [];

      let added = 0;
      let removed = 0;
      const diffLines: string[] = [];

      newLines.forEach((line, idx) => {
        if (!oldLines.includes(line)) {
          added++;
          diffLines.push(`+ L${idx + 1}: ${line}`);
        }
      });

      oldLines.forEach((line, idx) => {
        if (!newLines.includes(line)) {
          removed++;
          diffLines.push(`- L${idx + 1}: ${line}`);
        }
      });

      diffs.push({
        filePath: file,
        addedLinesCount: added,
        removedLinesCount: removed,
        diffText: diffLines.slice(0, 15).join('\n'),
      });
    }

    return diffs;
  }

  public async restoreCommit(projectId: string, commitId: string, targetProjectDir: string): Promise<boolean> {
    const commitDir = path.join(this.baseStoreDir, projectId, 'commits', commitId);
    if (!existsSync(commitDir)) return false;

    const files = await fs.readdir(commitDir);
    for (const f of files) {
      if (f === 'commit.json') continue;
      const src = path.join(commitDir, f);
      // Determine target destination (e.g. src/ or root)
      let dest = path.join(targetProjectDir, f);
      if (f.endsWith('.ts') && existsSync(path.join(targetProjectDir, 'src'))) {
        dest = path.join(targetProjectDir, 'src', f);
      }
      security.validatePathAccess(dest, 'write');
      await fs.copyFile(src, dest);
    }

    logger.info(`Commit ${commitId} für Projekt '${projectId}' erfolgreich wiederhergestellt.`);
    return true;
  }

  public async generateChangelog(projectId: string): Promise<string> {
    const commits = await this.listCommits(projectId);
    if (!commits.length) return `# Entwicklungsbericht / Changelog: ${projectId}\n\nNoch keine Commits vorhanden.`;

    let changelog = `# Entwicklungsbericht & Änderungshistorie: ${projectId}\n\n`;
    for (const c of commits) {
      changelog += `### Commit \`${c.id.substring(0, 14)}\` (${c.branch}) - ${c.timestamp.split('T')[0]}\n`;
      changelog += `* **Nachricht:** ${c.message}\n`;
      changelog += `* **Autor:** ${c.author}\n`;
      changelog += `* **Geänderte Dateien (${c.filesChanged.length}):**\n`;
      c.filesChanged.forEach(f => {
        changelog += `  - \`${path.basename(f)}\`\n`;
      });
      changelog += `\n`;
    }

    return changelog;
  }
}

export const versionManager = new VersionManager();
