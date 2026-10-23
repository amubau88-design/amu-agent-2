import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '../shared/logger.ts';
import type { UserAccount, AuthSession, UserRole, SubscriptionPlan } from './auth-types.ts';

const USERS_FILE = path.resolve(process.cwd(), 'scratch', 'users', 'users.json');
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEYLEN = 64;
const PBKDF2_DIGEST = 'sha512';

// In-memory session store
const sessions = new Map<string, AuthSession>();

// ─── Password helpers ────────────────────────────────────────────────────────

function hashPassword(password: string, salt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey.toString('hex'));
    });
  });
}

function generateSalt(): string {
  return crypto.randomBytes(32).toString('hex');
}

function generateToken(): string {
  return crypto.randomBytes(48).toString('hex');
}

// ─── User storage helpers ────────────────────────────────────────────────────

async function loadUsers(): Promise<UserAccount[]> {
  try {
    const raw = await fs.readFile(USERS_FILE, 'utf-8');
    return JSON.parse(raw) as UserAccount[];
  } catch {
    return [];
  }
}

async function saveUsers(users: UserAccount[]): Promise<void> {
  await fs.mkdir(path.dirname(USERS_FILE), { recursive: true });
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
}

// ─── Auth Service ────────────────────────────────────────────────────────────

class AuthService {
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    const users = await loadUsers();
    if (users.length === 0) {
      // Create default admin account
      const salt = generateSalt();
      const passwordHash = await hashPassword('amu-admin-2026', salt);
      const admin: UserAccount = {
        id: crypto.randomUUID(),
        username: 'admin',
        email: 'admin@amu.local',
        passwordHash,
        salt,
        role: 'admin',
        subscription: 'chat_coder',
        createdAt: new Date().toISOString(),
        isActive: true,
      };
      await saveUsers([admin]);
      logger.info('[AUTH] Standard-Admin-Konto erstellt: admin / amu-admin-2026');
    }
    // Clean up expired sessions on start
    this.cleanExpiredSessions();
  }

  private cleanExpiredSessions(): void {
    const now = Date.now();
    for (const [token, session] of sessions.entries()) {
      if (session.expiresAt < now) {
        sessions.delete(token);
      }
    }
  }

  async register(
    username: string,
    email: string,
    password: string,
    role: UserRole = 'customer',
    subscription: SubscriptionPlan = 'chat'
  ): Promise<{ success: boolean; error?: string; user?: Omit<UserAccount, 'passwordHash' | 'salt'> }> {
    if (!username || username.length < 3) return { success: false, error: 'Benutzername zu kurz (min. 3 Zeichen).' };
    if (!email || !email.includes('@')) return { success: false, error: 'Ungültige E-Mail-Adresse.' };
    if (!password || password.length < 8) return { success: false, error: 'Passwort zu kurz (min. 8 Zeichen).' };

    const users = await loadUsers();
    if (users.find(u => u.username === username || u.email === email)) {
      return { success: false, error: 'Benutzername oder E-Mail bereits vergeben.' };
    }

    const salt = generateSalt();
    const passwordHash = await hashPassword(password, salt);
    const user: UserAccount = {
      id: crypto.randomUUID(),
      username,
      email,
      passwordHash,
      salt,
      role,
      subscription,
      createdAt: new Date().toISOString(),
      isActive: true,
    };

    users.push(user);
    await saveUsers(users);
    logger.info(`[AUTH] Neuer Benutzer registriert: ${username} (${role})`);

    const { passwordHash: _ph, salt: _s, ...safeUser } = user;
    return { success: true, user: safeUser };
  }

  async login(
    usernameOrEmail: string,
    password: string
  ): Promise<{ success: boolean; error?: string; session?: AuthSession }> {
    const users = await loadUsers();
    const user = users.find(u =>
      (u.username === usernameOrEmail || u.email === usernameOrEmail) && u.isActive
    );

    if (!user) return { success: false, error: 'Benutzer nicht gefunden oder deaktiviert.' };

    const hash = await hashPassword(password, user.salt);
    if (hash !== user.passwordHash) {
      return { success: false, error: 'Falsches Passwort.' };
    }

    // Update last login
    user.lastLoginAt = new Date().toISOString();
    await saveUsers(users);

    const token = generateToken();
    const session: AuthSession = {
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        subscription: user.subscription,
      },
      expiresAt: Date.now() + SESSION_TTL_MS,
    };
    sessions.set(token, session);
    logger.info(`[AUTH] Login: ${user.username}`);
    return { success: true, session };
  }

  logout(token: string): void {
    sessions.delete(token);
  }

  getSession(token: string): AuthSession | null {
    const session = sessions.get(token);
    if (!session) return null;
    if (session.expiresAt < Date.now()) {
      sessions.delete(token);
      return null;
    }
    return session;
  }

  extractToken(authHeader?: string): string | null {
    if (!authHeader) return null;
    if (authHeader.startsWith('Bearer ')) return authHeader.substring(7);
    return authHeader;
  }

  async listUsers(): Promise<Omit<UserAccount, 'passwordHash' | 'salt'>[]> {
    const users = await loadUsers();
    return users.map(({ passwordHash: _ph, salt: _s, ...u }) => u);
  }

  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!newPassword || newPassword.length < 8) {
      return { success: false, error: 'Neues Passwort zu kurz (min. 8 Zeichen).' };
    }
    const users = await loadUsers();
    const user = users.find(u => u.id === userId);
    if (!user) return { success: false, error: 'Benutzer nicht gefunden.' };

    const hash = await hashPassword(oldPassword, user.salt);
    if (hash !== user.passwordHash) return { success: false, error: 'Altes Passwort falsch.' };

    user.salt = generateSalt();
    user.passwordHash = await hashPassword(newPassword, user.salt);
    await saveUsers(users);
    return { success: true };
  }
}

export const authService = new AuthService();
