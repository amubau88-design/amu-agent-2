export type UserRole = 'admin' | 'customer';
export type SubscriptionPlan = 'chat' | 'chat_coder';

export interface UserAccount {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  salt: string;
  role: UserRole;
  subscription: SubscriptionPlan;
  createdAt: string;
  lastLoginAt?: string;
  isActive: boolean;
}

export interface AuthSession {
  token: string;
  user: {
    id: string;
    username: string;
    email: string;
    role: UserRole;
    subscription: SubscriptionPlan;
  };
  expiresAt: number;
}

export interface SubscriptionDetails {
  plan: SubscriptionPlan;
  name: string;
  monthlyPriceEur: number;
  features: string[];
  maxProjects: number;
  maxUploadSizeMb: number;
  allowsCoderEngine: boolean;
}

export const SUBSCRIPTION_TIERS: Record<SubscriptionPlan, SubscriptionDetails> = {
  chat: {
    plan: 'chat',
    name: 'AMU KI-Chat Basic',
    monthlyPriceEur: 19.00,
    features: [
      'Unbegrenzte Konversationen mit dem allgemeinen KI-Assistenten',
      'Bildanalyse und Dokumentenauswertung (PDF, Office, Text)',
      'Sprachaufnahme & Sprachausgabe',
      'Kamera- und Videoanruf-Vorschau',
      'Smartphone-optimierte mobile Web-App',
      'Sichere, isolierte persönliche Dateiablage',
    ],
    maxProjects: 0,
    maxUploadSizeMb: 15,
    allowsCoderEngine: false,
  },
  chat_coder: {
    plan: 'chat_coder',
    name: 'AMU KI-Chat + Programmierer Pro',
    monthlyPriceEur: 79.00,
    features: [
      'Alle Funktionen des Tarifs AMU KI-Chat Basic',
      'KI-Programmierassistent mit direktem Code-Chat',
      'Autonome AMU-Agent-2 Entwickler-Engine (Multi-Step Pläne)',
      'Echte lokale Codegenerierung, Auto-Debugger & Unit-Tests',
      'Automatisierte Browser-E2E-Funktionsprüfung',
      'Lokale Git-Versionierung mit Commits, Diffs & Rollbacks',
      'Verwaltung und Start isolierter lokaler Web-Projekte',
      'Admin-Approval-Gate für sicherheitskritische Aktionen',
    ],
    maxProjects: 10,
    maxUploadSizeMb: 50,
    allowsCoderEngine: true,
  },
};
