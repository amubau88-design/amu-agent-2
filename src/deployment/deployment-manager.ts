export interface DeploymentPackage {
  id: string;
  projectId: string;
  version: string;
  targetEnv: 'staging' | 'production';
  status: 'draft' | 'built' | 'deployed' | 'failed' | 'rolled_back';
  domain?: string;
  dnsRecordsPrepared: Array<{
    type: 'A' | 'CNAME' | 'TXT';
    name: string;
    value: string;
    status: 'pending_admin_approval' | 'verified';
  }>;
  sslCertificate: {
    enabled: boolean;
    provider: 'LetsEncrypt' | 'SelfSigned' | 'Custom';
    validUntil?: string;
  };
  reverseProxyConfig: {
    type: 'nginx' | 'caddy' | 'node_internal';
    upstreamPort: number;
    publicHost: string;
  };
  createdAt: string;
  deployedAt?: string;
}

export class DeploymentManager {
  private deployments: Map<string, DeploymentPackage> = new Map();

  constructor() {
    this.createSampleDeployment();
  }

  private createSampleDeployment(): void {
    this.deployments.set('deploy_agent2_local', {
      id: 'deploy_agent2_local',
      projectId: 'AMU-Agent-2',
      version: '1.0.0-final',
      targetEnv: 'staging',
      status: 'deployed',
      domain: 'agent2.amu.test',
      dnsRecordsPrepared: [
        { type: 'A', name: 'agent2.amu.test', value: '127.0.0.1', status: 'verified' },
      ],
      sslCertificate: {
        enabled: true,
        provider: 'SelfSigned',
        validUntil: '2027-10-18',
      },
      reverseProxyConfig: {
        type: 'node_internal',
        upstreamPort: 3000,
        publicHost: 'agent2.amu.test',
      },
      createdAt: new Date().toISOString(),
      deployedAt: new Date().toISOString(),
    });

    this.deployments.set('deploy_demo_v1', {
      id: 'deploy_demo_v1',
      projectId: 'demo-app',
      version: '1.0.0',
      targetEnv: 'staging',
      status: 'draft',
      domain: 'demo-app.amu.local',
      dnsRecordsPrepared: [
        { type: 'A', name: 'demo-app.amu.local', value: '127.0.0.1', status: 'pending_admin_approval' },
      ],
      sslCertificate: {
        enabled: true,
        provider: 'SelfSigned',
        validUntil: '2027-01-01',
      },
      reverseProxyConfig: {
        type: 'node_internal',
        upstreamPort: 3101,
        publicHost: 'demo-app.amu.local',
      },
      createdAt: new Date().toISOString(),
    });
  }

  public listDeployments(): DeploymentPackage[] {
    return Array.from(this.deployments.values());
  }

  public getDeployment(id: string): DeploymentPackage | undefined {
    return this.deployments.get(id);
  }

  public prepareDeploymentPackage(
    projectId: string,
    version: string,
    targetEnv: 'staging' | 'production' = 'staging',
    domain = `${projectId}.amu.local`
  ): DeploymentPackage {
    const id = `deploy_${projectId}_${Date.now()}`;
    const pkg: DeploymentPackage = {
      id,
      projectId,
      version,
      targetEnv,
      status: 'draft',
      domain,
      dnsRecordsPrepared: [
        { type: 'A', name: domain, value: '127.0.0.1', status: 'pending_admin_approval' },
      ],
      sslCertificate: {
        enabled: true,
        provider: 'SelfSigned',
      },
      reverseProxyConfig: {
        type: 'node_internal',
        upstreamPort: 3100,
        publicHost: domain,
      },
      createdAt: new Date().toISOString(),
    };

    this.deployments.set(id, pkg);
    return pkg;
  }

  public async promoteDeployment(id: string, adminApproved = false): Promise<{ success: boolean; message: string }> {
    const pkg = this.deployments.get(id);
    if (!pkg) return { success: false, message: `Deployment-Paket '${id}' nicht gefunden.` };

    if (pkg.targetEnv === 'production' && !adminApproved) {
      return {
        success: false,
        message: 'SICHERHEITS-STOPP: Produktive Veröffentlichungen oder DNS-Änderungen erfordern zwingend eine explizite Admin-Freigabe!',
      };
    }

    pkg.status = 'deployed';
    pkg.deployedAt = new Date().toISOString();
    return {
      success: true,
      message: `Deployment '${id}' für Umgebung '${pkg.targetEnv}' erfolgreich bereitgestellt.`,
    };
  }

  public async rollbackDeployment(id: string): Promise<{ success: boolean; message: string }> {
    const pkg = this.deployments.get(id);
    if (!pkg) return { success: false, message: `Deployment '${id}' nicht gefunden.` };

    pkg.status = 'rolled_back';
    return {
      success: true,
      message: `Deployment '${id}' erfolgreich zurückgerollt auf vorherigen stabilen Stand.`,
    };
  }
}

export const deploymentManager = new DeploymentManager();
