/// <reference types="node" />
import path from "path";
import fs from "fs";
import { DatabaseSync } from "node:sqlite";

/**
 * LUMA Local Context & Memory Database
 *
 * Built strictly on local SQLite (node:sqlite standard library).
 * Zero cloud dependency, zero external AI API required.
 */

export interface UserProfileRecord {
  key: string;
  value: string;
  category: string;
  is_editable: number;
  updated_at: string;
}

export interface UserPreferenceRecord {
  id?: number;
  category: string;
  key: string;
  value: string;
  updated_at: string;
}

export interface LongTermMemoryRecord {
  id?: number;
  topic: string;
  content: string;
  tags: string;
  importance: number;
  created_at: string;
  updated_at: string;
}

export interface ConversationSummaryRecord {
  id?: number;
  session_id: string;
  summary: string;
  key_points: string;
  created_at: string;
}

export interface ActiveTaskContextRecord {
  id?: number;
  task_id: string;
  goal: string;
  current_step: number;
  step_results: string;
  state_data: string;
  is_active: number;
  updated_at: string;
}

export interface AssistantIdentityRecord {
  key: string;
  value: string;
  status: string;
  updated_at: string;
}

export interface ProjectInfoRecord {
  key: string;
  value: string;
  category: string;
  updated_at: string;
}

export interface MemoryAuditLogRecord {
  id?: number;
  action: "SAVE" | "RETRIEVE" | "UPDATE" | "DELETE" | "REVIEW" | "CORRECT" | "ARCHIVE";
  category: string;
  record_id?: string;
  details: string;
  timestamp: string;
}

export interface CalendarTokenRecord {
  id?: number;
  provider: string;
  account_email: string;
  encrypted_refresh_token: string;
  iv: string;
  auth_tag: string;
  scopes: string;
  created_at: string;
  updated_at: string;
}

export class MemoryDatabase {
  private static instance: DatabaseSync | null = null;
  private static dbPath: string = "";

  /**
   * Initializes and returns the local SQLite database.
   */
  static getDb(): DatabaseSync {
    if (this.instance) {
      return this.instance;
    }

    const dataDir = path.resolve(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.dbPath = path.join(dataDir, "luma_memory.sqlite");
    this.instance = new DatabaseSync(this.dbPath);

    this.instance.exec("PRAGMA journal_mode = WAL;");
    this.instance.exec("PRAGMA foreign_keys = ON;");

    this.initTables();
    this.seedInitialData();

    return this.instance;
  }

  /**
   * Creates logically separated tables.
   */
  private static initTables(): void {
    if (!this.instance) return;

    this.instance.exec(`
      -- 1. User Profile
      CREATE TABLE IF NOT EXISTS user_profile (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'general',
        is_editable INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      );

      -- 2. User Preferences
      CREATE TABLE IF NOT EXISTS user_preferences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        key TEXT NOT NULL UNIQUE,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- 3. Long-Term Memory
      CREATE TABLE IF NOT EXISTS long_term_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        topic TEXT NOT NULL,
        content TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '',
        importance INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- 4. Conversation Summaries
      CREATE TABLE IF NOT EXISTS conversation_summaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        summary TEXT NOT NULL,
        key_points TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );

      -- 5. Active Task Context
      CREATE TABLE IF NOT EXISTS active_task_context (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL UNIQUE,
        goal TEXT NOT NULL,
        current_step INTEGER NOT NULL DEFAULT 1,
        step_results TEXT NOT NULL DEFAULT '{}',
        state_data TEXT NOT NULL DEFAULT '{}',
        is_active INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      );

      -- 6. Assistant Identity & Capabilities
      CREATE TABLE IF NOT EXISTS assistant_identity (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'implemented',
        updated_at TEXT NOT NULL
      );

      -- 7. Project Information
      CREATE TABLE IF NOT EXISTS project_info (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'project',
        updated_at TEXT NOT NULL
      );

      -- 8. Memory Audit Log
      CREATE TABLE IF NOT EXISTS memory_audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL,
        category TEXT NOT NULL,
        record_id TEXT,
        details TEXT NOT NULL,
        timestamp TEXT NOT NULL
      );

      -- 9. Calendar Encrypted Tokens (Phase 1)
      CREATE TABLE IF NOT EXISTS calendar_tokens (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        provider TEXT NOT NULL DEFAULT 'google',
        account_email TEXT NOT NULL,
        encrypted_refresh_token TEXT NOT NULL,
        iv TEXT NOT NULL,
        auth_tag TEXT NOT NULL,
        scopes TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  /**
   * Seeds initial known facts into the database.
   * Unknown information remains unknown.
   */
  private static seedInitialData(): void {
    if (!this.instance) return;

    const now = new Date().toISOString();

    // 1. Initial User Profile (Strictly the known facts)
    const profileSeeds = [
      { key: "education", value: "Final-year B.Tech CSE student in India", category: "personal" },
      { key: "coding_comfort", value: "Medium coding comfort", category: "skills" },
      { key: "interests", value: "AI automation, AI agents and personal assistants", category: "interests" },
      { key: "language_preference", value: "Hinglish in Roman Hindi and English", category: "preferences" },
      { key: "explanation_style", value: "Practical, structured, step-by-step technical explanations", category: "preferences" },
      { key: "learning_philosophy", value: "Wants to understand code instead of blindly copying it", category: "preferences" },
      { key: "processing_preference", value: "Local-first processing and minimal external APIs", category: "preferences" },
      { key: "hardware_specs", value: "8 GB RAM, NVIDIA GPU, Intel i5 / Ryzen 5, 512 GB SSD", category: "hardware" },
      { key: "main_project", value: "LUMA personal AI assistant", category: "projects" },
    ];

    const insertProfile = this.instance.prepare(`
      INSERT OR IGNORE INTO user_profile (key, value, category, is_editable, updated_at)
      VALUES (?, ?, ?, 1, ?)
    `);

    for (const seed of profileSeeds) {
      insertProfile.run(seed.key, seed.value, seed.category, now);
    }

    // 2. Initial User Preferences
    const preferenceSeeds = [
      { category: "communication", key: "language", value: "Hinglish (Roman Hindi + English)" },
      { category: "communication", key: "style", value: "Practical, structured, step-by-step" },
      { category: "code", key: "philosophy", value: "Understand concepts, no blind copy-paste" },
      { category: "architecture", key: "privacy", value: "Local-first processing, minimal external APIs" },
    ];

    const insertPref = this.instance.prepare(`
      INSERT OR IGNORE INTO user_preferences (category, key, value, updated_at)
      VALUES (?, ?, ?, ?)
    `);

    for (const pref of preferenceSeeds) {
      insertPref.run(pref.category, pref.key, pref.value, now);
    }

    // 3. Assistant Identity
    const identitySeeds = [
      { key: "name", value: "LUMA", status: "implemented" },
      { key: "role", value: "Personal AI Computer Assistant", status: "implemented" },
      { key: "purpose", value: "Understand user instructions and execute actual computer tasks", status: "implemented" },
      { key: "interaction_current", value: "Text-based interface for development", status: "implemented" },
      { key: "interaction_target", value: "Voice-first always-on personal assistant", status: "planned" },
      { key: "capability_windows_control", value: "Application launching, window focusing, switching, minimizing, restoring", status: "implemented" },
      { key: "capability_browser_automation", value: "Chrome session control, search, DOM extraction, price comparison", status: "implemented" },
      { key: "capability_youtube_playback", value: "YouTube search, video playback, pause, resume, playlist control", status: "implemented" },
      { key: "capability_memory_system", value: "Local context awareness, personal memory, audit logging", status: "implemented" },
      { key: "capability_voice_assistant", value: "Always-on voice wake-word & speech processing", status: "planned" },
    ];

    const insertIdentity = this.instance.prepare(`
      INSERT OR IGNORE INTO assistant_identity (key, value, status, updated_at)
      VALUES (?, ?, ?, ?)
    `);

    for (const iden of identitySeeds) {
      insertIdentity.run(iden.key, iden.value, iden.status, now);
    }

    // 4. Project Information
    const projectSeeds = [
      { key: "project_name", value: "LUMA", category: "meta" },
      { key: "architecture", value: "React + Vite frontend, Express + TypeScript backend, Win32/.NET native bridges, Playwright browser automation", category: "tech" },
      { key: "hardware_constraints", value: "8 GB RAM, NVIDIA GPU, Intel i5 / Ryzen 5, 512 GB SSD", category: "hardware" },
      { key: "design_principles", value: "Observe -> Act -> Verify -> Recover. Honest error reporting, zero false success.", category: "design" },
    ];

    const insertProj = this.instance.prepare(`
      INSERT OR IGNORE INTO project_info (key, value, category, updated_at)
      VALUES (?, ?, ?, ?)
    `);

    for (const proj of projectSeeds) {
      insertProj.run(proj.key, proj.value, proj.category, now);
    }
  }

  /**
   * Closes the database connection.
   */
  static close(): void {
    if (this.instance) {
      this.instance.close();
      this.instance = null;
    }
  }

  /**
   * Resets database (primarily for testing).
   */
  static reset(): void {
    this.close();
    if (this.dbPath && fs.existsSync(this.dbPath)) {
      try {
        fs.unlinkSync(this.dbPath);
      } catch {}
    }
    this.getDb();
  }
}
