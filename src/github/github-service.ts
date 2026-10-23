import type {
  GitHubAuthConfig,
  GitHubRepoSummary,
  GitHubBranch,
  GitHubPullRequest,
  GitHubIssue,
  GitHubWorkflowRun,
} from './github-types.ts';
import { SecurityGuard, DEFAULT_PERMISSIONS } from '../shared/security.ts';

const security = new SecurityGuard(DEFAULT_PERMISSIONS);

export class GitHubService {
  private token: string | null = null;
  private username: string | null = null;
  private apiBase = 'https://api.github.com';

  constructor() {
    // Read securely from env without hardcoding tokens in code
    this.token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || null;
    this.username = process.env.GITHUB_USERNAME || null;
  }

  public setToken(token: string, username?: string): void {
    this.token = token.trim();
    if (username) this.username = username.trim();
  }

  public getAuthConfig(): GitHubAuthConfig {
    return {
      configured: Boolean(this.token),
      username: this.username || (this.token ? 'authenticated_user' : undefined),
      hasToken: Boolean(this.token),
      authType: this.token ? 'token' : 'none',
    };
  }

  public async listUserRepositories(): Promise<GitHubRepoSummary[]> {
    if (!this.token) {
      return [];
    }

    const data = await this.request<Array<Record<string, unknown>>>('/user/repos?sort=updated&per_page=30');
    return data.map(repo => ({
      name: repo.name as string,
      fullName: repo.full_name as string,
      owner: (repo.owner as { login: string })?.login,
      private: Boolean(repo.private),
      defaultBranch: (repo.default_branch as string) || 'main',
      htmlUrl: repo.html_url as string,
      description: repo.description as string | undefined,
    }));
  }

  public async getRepoBranches(owner: string, repo: string): Promise<GitHubBranch[]> {
    if (!this.token) return [{ name: 'main', protected: false, commitSha: 'local_sha_mock' }];

    const data = await this.request<Array<Record<string, unknown>>>(`/repos/${owner}/${repo}/branches`);
    return data.map(b => ({
      name: b.name as string,
      protected: Boolean(b.protected),
      commitSha: (b.commit as { sha: string })?.sha || '',
    }));
  }

  public async listPullRequests(owner: string, repo: string): Promise<GitHubPullRequest[]> {
    if (!this.token) return [];

    const data = await this.request<Array<Record<string, unknown>>>(`/repos/${owner}/${repo}/pulls?state=all&per_page=20`);
    return data.map(pr => ({
      number: pr.number as number,
      title: pr.title as string,
      state: pr.state as 'open' | 'closed',
      branch: (pr.head as { ref: string })?.ref || '',
      baseBranch: (pr.base as { ref: string })?.ref || '',
      htmlUrl: pr.html_url as string,
      author: (pr.user as { login: string })?.login || '',
      createdAt: pr.created_at as string,
    }));
  }

  public async listIssues(owner: string, repo: string): Promise<GitHubIssue[]> {
    if (!this.token) return [];

    const data = await this.request<Array<Record<string, unknown>>>(`/repos/${owner}/${repo}/issues?state=all&per_page=20`);
    return data.filter(i => !('pull_request' in i)).map(issue => ({
      number: issue.number as number,
      title: issue.title as string,
      state: issue.state as 'open' | 'closed',
      body: issue.body as string | undefined,
      author: (issue.user as { login: string })?.login || '',
      htmlUrl: issue.html_url as string,
    }));
  }

  public async listWorkflowRuns(owner: string, repo: string): Promise<GitHubWorkflowRun[]> {
    if (!this.token) return [];

    const data = await this.request<{ workflow_runs: Array<Record<string, unknown>> }>(`/repos/${owner}/${repo}/actions/runs?per_page=10`);
    return (data.workflow_runs || []).map(run => ({
      id: run.id as number,
      name: run.name as string,
      status: run.status as 'queued' | 'in_progress' | 'completed',
      conclusion: run.conclusion as 'success' | 'failure' | 'cancelled' | null,
      branch: run.head_branch as string,
      htmlUrl: run.html_url as string,
    }));
  }

  public async createBranch(owner: string, repo: string, newBranch: string, fromBranch = 'main'): Promise<{ success: boolean; message: string }> {
    if (!this.token) {
      return { success: false, message: 'GitHub-Token nicht hinterlegt. Branch kann lokal simuliert werden.' };
    }

    try {
      const refData = await this.request<{ object: { sha: string } }>(`/repos/${owner}/${repo}/git/refs/heads/${fromBranch}`);
      await this.request(`/repos/${owner}/${repo}/git/refs`, 'POST', {
        ref: `refs/heads/${newBranch}`,
        sha: refData.object.sha,
      });
      return { success: true, message: `Branch '${newBranch}' erfolgreich auf GitHub erstellt.` };
    } catch (err: unknown) {
      return { success: false, message: (err as Error).message };
    }
  }

  public async createPullRequest(owner: string, repo: string, title: string, headBranch: string, baseBranch = 'main', body = ''): Promise<{ success: boolean; htmlUrl?: string; message: string }> {
    if (!this.token) {
      return { success: false, message: 'GitHub-Token nicht hinterlegt. Bitte zuerst Token konfigurieren.' };
    }

    try {
      const prData = await this.request<{ html_url: string }>(`/repos/${owner}/${repo}/pulls`, 'POST', {
        title,
        head: headBranch,
        base: baseBranch,
        body,
      });
      return { success: true, htmlUrl: prData.html_url, message: `Pull Request '${title}' erfolgreich angelegt.` };
    } catch (err: unknown) {
      return { success: false, message: (err as Error).message };
    }
  }

  private async request<T>(endpoint: string, method: 'GET' | 'POST' = 'GET', body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'AMU-Agent-2-Developer-Engine',
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const config: RequestInit = {
      method,
      headers,
    };
    if (body) {
      headers['Content-Type'] = 'application/json';
      config.body = JSON.stringify(body);
    }

    const res = await fetch(`${this.apiBase}${endpoint}`, config);
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`GitHub API Fehler (${res.status}): ${errText}`);
    }
    return (await res.json()) as T;
  }
}

export const githubService = new GitHubService();
