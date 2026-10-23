import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { amuInference, type Message } from '../inference/engine.ts';
import { logger } from '../shared/logger.ts';

const CONVERSATIONS_DIR = path.resolve(process.cwd(), 'scratch', 'chat-history');

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  durationMs?: number;
}

export interface Conversation {
  id: string;
  userId: string;
  title: string;
  mode: 'general' | 'coder';
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

// Direct AMU embedded inference; no HTTP model server required.
async function localChat(messages: { role: string; content: string }[], onToken?: (token: string) => void): Promise<{ reply: string; durationMs: number }> {
  const result = await amuInference.generate({ model: amuInference.status().model, messages: messages as Message[], maxTokens: 512, onChunk: onToken });
  return { reply: result.content, durationMs: result.durationMs };
}

// ─── File helpers ────────────────────────────────────────────────────────────

async function loadConversation(convId: string): Promise<Conversation | null> {
  try {
    const file = path.join(CONVERSATIONS_DIR, `${convId}.json`);
    const raw = await fs.readFile(file, 'utf-8');
    return JSON.parse(raw) as Conversation;
  } catch {
    return null;
  }
}

async function saveConversation(conv: Conversation): Promise<void> {
  await fs.mkdir(CONVERSATIONS_DIR, { recursive: true });
  const file = path.join(CONVERSATIONS_DIR, `${conv.id}.json`);
  await fs.writeFile(file, JSON.stringify(conv, null, 2), 'utf-8');
}

async function listConversationsForUser(userId: string): Promise<Conversation[]> {
  try {
    await fs.mkdir(CONVERSATIONS_DIR, { recursive: true });
    const files = await fs.readdir(CONVERSATIONS_DIR);
    const convs: Conversation[] = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = await fs.readFile(path.join(CONVERSATIONS_DIR, file), 'utf-8');
        const conv = JSON.parse(raw) as Conversation;
        if (conv.userId === userId) convs.push(conv);
      } catch { /* skip corrupt files */ }
    }
    return convs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

// ─── Chat Service ────────────────────────────────────────────────────────────

class ChatService {
  private pendingConversations = new Set<string>();

  async createConversation(userId: string, title: string, mode: 'general' | 'coder' = 'general'): Promise<Conversation> {
    const conv: Conversation = {
      id: crypto.randomUUID(),
      userId,
      title: title || (mode === 'coder' ? 'KI-Programmierer Sitzung' : 'Neue Unterhaltung'),
      mode,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveConversation(conv);
    return conv;
  }

  async listConversations(userId: string): Promise<Conversation[]> {
    return listConversationsForUser(userId);
  }

  async getConversation(convId: string, userId: string): Promise<Conversation | null> {
    const conv = await loadConversation(convId);
    if (!conv || conv.userId !== userId) return null;
    return conv;
  }

  async deleteConversation(convId: string, userId: string): Promise<boolean> {
    const conv = await loadConversation(convId);
    if (!conv || conv.userId !== userId) return false;
    try {
      await fs.unlink(path.join(CONVERSATIONS_DIR, `${convId}.json`));
      return true;
    } catch {
      return false;
    }
  }

  async sendMessage(convId: string, userId: string, userMessage: string, maxUploadSizeMb = 15): Promise<{ userMsg: ChatMessage; assistantMsg: ChatMessage }> {
    if (this.pendingConversations.has(convId)) throw new Error('Eine Nachricht dieser Konversation wird bereits verarbeitet.');
    this.pendingConversations.add(convId);
    try { return await this.sendMessageControlled(convId, userId, userMessage, maxUploadSizeMb); }
    finally { this.pendingConversations.delete(convId); }
  }

  private async sendMessageControlled(
    convId: string,
    userId: string,
    userMessage: string,
    maxUploadSizeMb: number = 15
  ): Promise<{ userMsg: ChatMessage; assistantMsg: ChatMessage }> {
    const conv = await loadConversation(convId);
    if (!conv || conv.userId !== userId) throw new Error('Konversation nicht gefunden.');

    // System prompt based on mode
    const systemPrompt = conv.mode === 'coder'
      ? 'Du bist AMU KI-Programmierer, ein erfahrener Software-Entwickler-Assistent. ' +
        'Du hilfst beim Schreiben, Analysieren und Debuggen von Code. ' +
        'Antworte präzise, verwende Code-Blöcke mit Syntax-Highlighting und erkläre deine Entscheidungen.'
      : 'Du bist AMU KI-Assistent, ein hilfreicher allgemeiner Assistent. ' +
        'Antworte auf Deutsch, es sei denn, der Benutzer spricht eine andere Sprache. ' +
        'Sei freundlich, klar und präzise.';

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
    };
    conv.messages.push(userMsg);

    // Build local message history (last 20 messages for context window)
    const historyMessages = conv.messages.slice(-20).map(m => ({
      role: m.role as string,
      content: m.content,
    }));
    const localMessages = [
      { role: 'system', content: systemPrompt },
      ...historyMessages,
    ];

    let reply = '';
    let durationMs = 0;
    try {
      const result = await localChat(localMessages);
      reply = result.reply || 'Ich konnte keine Antwort generieren.';
      durationMs = result.durationMs;
    } catch (err: unknown) {
      logger.warn(`[CHAT] AMU-Engine-Fehler: ${(err as Error).message}`);
      reply = `[KI momentan nicht verfügbar – AMU-Engine-Fehler: ${(err as Error).message}]`;
    }

    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: reply,
      timestamp: new Date().toISOString(),
      durationMs,
    };
    conv.messages.push(assistantMsg);
    conv.updatedAt = new Date().toISOString();

    // Auto-title after first exchange
    if (conv.messages.length === 2 && conv.title === 'Neue Unterhaltung') {
      conv.title = userMessage.length > 50 ? userMessage.substring(0, 47) + '...' : userMessage;
    }

    await saveConversation(conv);
    return { userMsg, assistantMsg };
  }
}

export const chatService = new ChatService();
