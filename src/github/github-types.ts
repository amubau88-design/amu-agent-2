export interface GitHubAuthConfig {
  configured: boolean;
  username?: string;
  hasToken: boolean;
  authType: 'token' | 'none';
}

export interface GitHubRepoSummary {
  name: string;
  fullName: string;
  owner: string;
  private: boolean;
  defaultBranch: string;
  htmlUrl: string;
  description?: string;
}

export interface GitHubBranch {
  name: string;
  protected: boolean;
  commitSha: string;
}

export interface GitHubPullRequest {
  number: number;
  title: string;
  state: 'open' | 'closed' | 'merged';
  branch: string;
  baseBranch: string;
  htmlUrl: string;
  author: string;
  createdAt: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  state: 'open' | 'closed';
  body?: string;
  author: string;
  htmlUrl: string;
}

export interface GitHubWorkflowRun {
  id: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'cancelled' | null;
  branch: string;
  htmlUrl: string;
}
