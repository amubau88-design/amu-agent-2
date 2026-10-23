export interface ManagedServer {
  id: string;
  name: string;
  type: 'local_node' | 'windows' | 'linux_vps' | 'cloud_vm';
  host: string;
  port: number;
  username?: string;
  status: 'online' | 'offline' | 'unreachable' | 'maintenance';
  lastPingMs?: number;
  osInfo: string;
  cpuPercent?: number;
  ramUsageMb?: number;
  diskFreeGb?: number;
  servicesRunning: string[];
  isProduction: boolean;
}

export class ServerManager {
  private servers: Map<string, ManagedServer> = new Map();

  constructor() {
    this.registerInitialNodes();
  }

  private registerInitialNodes(): void {
    // Local Primary Node
    this.servers.set('local-primary', {
      id: 'local-primary',
      name: 'AMU Primärer Entwicklungs-Host (Lokal)',
      type: 'local_node',
      host: '127.0.0.1',
      port: 3000,
      status: 'online',
      lastPingMs: 1,
      osInfo: 'Windows (Node.js 24)',
      cpuPercent: 5,
      ramUsageMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      diskFreeGb: 32,
      servicesRunning: ['AMU API', 'AMU AI Runtime', 'Task Router', 'Web Terminal'],
      isProduction: false,
    });

    // Staging LAN Node (Vorbereitet)
    this.servers.set('staging-lan-node', {
      id: 'staging-lan-node',
      name: 'AMU LAN Staging Worker (Vorbereitet)',
      type: 'linux_vps',
      host: '192.168.1.100',
      port: 22,
      status: 'offline',
      osInfo: 'Ubuntu Linux 24.04 LTS (Testumgebung)',
      servicesRunning: ['SSH (Port 22)', 'Docker Engine', 'Reverse Proxy'],
      isProduction: false,
    });
  }

  public listServers(): ManagedServer[] {
    // Update local metrics
    const local = this.servers.get('local-primary');
    if (local) {
      local.ramUsageMb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    }
    return Array.from(this.servers.values());
  }

  public getServer(id: string): ManagedServer | undefined {
    return this.servers.get(id);
  }

  public async pingServer(id: string): Promise<{ success: boolean; latencyMs?: number; message: string }> {
    const server = this.servers.get(id);
    if (!server) return { success: false, message: `Server '${id}' existiert nicht.` };

    if (server.type === 'local_node') {
      server.status = 'online';
      server.lastPingMs = 1;
      return { success: true, latencyMs: 1, message: 'Lokaler Server antwortet einwandfrei.' };
    }

    // Remote mock check for offline staged node
    return {
      success: false,
      message: `Remote-Server '${server.name}' (${server.host}) ist aktuell offline oder nicht konfiguriert. Keine produktiven Eingriffe ohne Freigabe.`,
    };
  }

  public addServer(config: Omit<ManagedServer, 'status' | 'servicesRunning'>): ManagedServer {
    const server: ManagedServer = {
      ...config,
      status: 'offline',
      servicesRunning: [],
      isProduction: false, // Immer als non-prod default für maximale Sicherheit
    };
    this.servers.set(server.id, server);
    return server;
  }
}

export const serverManager = new ServerManager();
