import {
  MemoryDatabase,
  type UserProfileRecord,
  type UserPreferenceRecord,
  type LongTermMemoryRecord,
  type ActiveTaskContextRecord,
  type AssistantIdentityRecord,
  type MemoryAuditLogRecord,
} from "./database.js";

export interface CompactContext {
  command: string;
  intent?: string;
  relevantProfile: Record<string, string>;
  relevantPreferences: Record<string, string>;
  relevantMemories: Array<{ id: number; topic: string; content: string }>;
  activeTask?: {
    taskId: string;
    goal: string;
    currentStep: number;
    stepResults: Record<string, any>;
  };
  assistantIdentity: {
    name: string;
    role: string;
    interactionMode: string;
    capabilities: Record<string, string>;
  };
  relevantProject: Record<string, string>;
}

export class ContextManager {
  private static sensitivePatterns = [
    /\b(?:password|passwd|pwd|passcode)\b[:=]?\s*[\S]+/i,
    /\b(?:otp|one[- ]time[- ]password|verification[- ]code)\b[:=]?\s*[\d]{4,8}/i,
    /\b(?:api[-_]?key|secret[-_]?key|access[-_]?token|auth[-_]?token|bearer\s+[a-zA-Z0-9_\-\.]+)\b/i,
    /\b(?:cvv|cvc|card[- ]number|credit[- ]card)\b/i,
    /\b4[0-9]{12}(?:[0-9]{3})?\b/, // Visa
    /\b5[1-5][0-9]{14}\b/, // MasterCard
  ];

  /**
   * Validates that text does not contain passwords, OTPs, or auth secrets.
   */
  static containsSensitiveData(text: string): boolean {
    if (!text || typeof text !== "string") return false;
    return this.sensitivePatterns.some((pattern) => pattern.test(text));
  }

  /**
   * Log an action to the memory audit log.
   */
  private static logAudit(
    action: MemoryAuditLogRecord["action"],
    category: string,
    recordId: string | undefined,
    details: string
  ): void {
    try {
      const db = MemoryDatabase.getDb();
      const now = new Date().toISOString();
      const stmt = db.prepare(`
        INSERT INTO memory_audit_log (action, category, record_id, details, timestamp)
        VALUES (?, ?, ?, ?, ?)
      `);
      stmt.run(action, category, recordId || null, details, now);
    } catch {
      // Non-fatal
    }
  }

  /**
   * Builds a compact, highly relevant structured context for an incoming user command.
   * Strictly avoids dumping the entire database into context.
   */
  static buildContext(command: string, intent?: string): CompactContext {
    const db = MemoryDatabase.getDb();
    const cleanCmd = (command || "").toLowerCase();

    // 1. Selectively retrieve relevant user profile info
    const allProfile = (db.prepare("SELECT key, value, category FROM user_profile").all() as any[]) || [];
    const relevantProfile: Record<string, string> = {};

    for (const p of allProfile) {
      const k = p.key.toLowerCase();
      // Match keywords in command
      if (
        cleanCmd.includes("form") ||
        cleanCmd.includes("detail") ||
        cleanCmd.includes("profile") ||
        cleanCmd.includes("who am i") ||
        cleanCmd.includes("about me")
      ) {
        relevantProfile[p.key] = p.value;
      } else if (
        (cleanCmd.includes("code") || cleanCmd.includes("script") || cleanCmd.includes("programming")) &&
        (k.includes("coding") || k.includes("learning") || k.includes("education"))
      ) {
        relevantProfile[p.key] = p.value;
      } else if (
        (cleanCmd.includes("explain") || cleanCmd.includes("kya hai") || cleanCmd.includes("batao")) &&
        (k.includes("explanation") || k.includes("language"))
      ) {
        relevantProfile[p.key] = p.value;
      } else if (
        (cleanCmd.includes("hardware") || cleanCmd.includes("ram") || cleanCmd.includes("gpu") || cleanCmd.includes("spec")) &&
        k.includes("hardware")
      ) {
        relevantProfile[p.key] = p.value;
      }
    }

    // Always include language preference & education if available
    for (const p of allProfile) {
      if (p.key === "language_preference" || p.key === "education") {
        relevantProfile[p.key] = p.value;
      }
    }

    // 2. Selectively retrieve relevant preferences
    const allPrefs = (db.prepare("SELECT key, value FROM user_preferences").all() as any[]) || [];
    const relevantPreferences: Record<string, string> = {};
    for (const pref of allPrefs) {
      if (
        cleanCmd.includes("language") ||
        cleanCmd.includes("hindi") ||
        cleanCmd.includes("style") ||
        cleanCmd.includes("privacy")
      ) {
        relevantPreferences[pref.key] = pref.value;
      }
    }
    // Always include communication style
    const commStyle = allPrefs.find((p) => p.key === "style");
    if (commStyle) relevantPreferences["style"] = commStyle.value;

    // 3. Selectively retrieve relevant long-term memories via keyword relevance
    const words = cleanCmd.split(/\s+/).filter((w) => w.length > 3);
    const relevantMemories: Array<{ id: number; topic: string; content: string }> = [];

    if (words.length > 0) {
      const allMemories = (db.prepare("SELECT id, topic, content, tags, importance FROM long_term_memory ORDER BY importance DESC, updated_at DESC LIMIT 50").all() as any[]) || [];
      for (const m of allMemories) {
        const textToMatch = `${m.topic} ${m.content} ${m.tags}`.toLowerCase();
        const hasMatch = words.some((w) => textToMatch.includes(w));
        if (hasMatch) {
          relevantMemories.push({ id: m.id, topic: m.topic, content: m.content });
          if (relevantMemories.length >= 5) break; // Limit to top 5 relevant
        }
      }
    }

    // 4. Retrieve Active Task Context (if any active task is in progress)
    let activeTask: CompactContext["activeTask"] = undefined;
    const activeRow = db.prepare("SELECT task_id, goal, current_step, step_results FROM active_task_context WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 1").get() as any;
    if (activeRow) {
      try {
        activeTask = {
          taskId: activeRow.task_id,
          goal: activeRow.goal,
          currentStep: activeRow.current_step,
          stepResults: JSON.parse(activeRow.step_results || "{}"),
        };
      } catch {
        // Fallback
      }
    }

    // 5. Retrieve Assistant Identity
    const identityRows = (db.prepare("SELECT key, value, status FROM assistant_identity").all() as any[]) || [];
    const capabilities: Record<string, string> = {};
    let name = "LUMA";
    let role = "Personal AI Computer Assistant";
    let interactionMode = "Text-based for development";

    for (const row of identityRows) {
      if (row.key === "name") name = row.value;
      else if (row.key === "role") role = row.value;
      else if (row.key === "interaction_current") interactionMode = row.value;
      else if (row.key.startsWith("capability_")) {
        capabilities[row.key.replace("capability_", "")] = row.status;
      }
    }

    // 6. Project Information
    const projRows = (db.prepare("SELECT key, value FROM project_info").all() as any[]) || [];
    const relevantProject: Record<string, string> = {};
    for (const row of projRows) {
      if (cleanCmd.includes("luma") || cleanCmd.includes("project") || cleanCmd.includes("system") || cleanCmd.includes("architecture")) {
        relevantProject[row.key] = row.value;
      }
    }

    this.logAudit("RETRIEVE", "context", undefined, `Retrieved context for command: "${command.slice(0, 50)}"`);

    return {
      command,
      intent,
      relevantProfile,
      relevantPreferences,
      relevantMemories,
      activeTask,
      assistantIdentity: {
        name,
        role,
        interactionMode,
        capabilities,
      },
      relevantProject,
    };
  }

  // ===========================================================================
  // MEMORY MANAGEMENT (CRUD, REVIEW, CORRECT, ARCHIVE)
  // ===========================================================================

  /**
   * Saves a new long-term memory item after verifying it does not contain sensitive data.
   */
  static saveMemory(
    topic: string,
    content: string,
    tags: string[] = [],
    importance: number = 1
  ): { success: boolean; id?: number; message: string } {
    if (!topic || !content) {
      return { success: false, message: "Topic and content are required to save a memory." };
    }

    if (this.containsSensitiveData(content) || this.containsSensitiveData(topic)) {
      return {
        success: false,
        message: "Security violation: Sensitive data (passwords, OTPs, API keys, or financial data) cannot be saved into memory.",
      };
    }

    const db = MemoryDatabase.getDb();
    const now = new Date().toISOString();
    const tagString = tags.join(",").toLowerCase();

    const stmt = db.prepare(`
      INSERT INTO long_term_memory (topic, content, tags, importance, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(topic.trim(), content.trim(), tagString, importance, now, now);
    const newId = Number(result.lastInsertRowid);

    this.logAudit("SAVE", "long_term_memory", String(newId), `Saved memory topic: "${topic}"`);

    return {
      success: true,
      id: newId,
      message: `Memory saved successfully: "${topic}".`,
    };
  }

  /**
   * Retrieves long-term memories with optional filtering.
   */
  static getMemories(filter?: {
    topic?: string;
    tag?: string;
    query?: string;
  }): LongTermMemoryRecord[] {
    const db = MemoryDatabase.getDb();
    let query = "SELECT id, topic, content, tags, importance, created_at, updated_at FROM long_term_memory WHERE 1=1";
    const params: any[] = [];

    if (filter?.topic) {
      query += " AND topic LIKE ?";
      params.push(`%${filter.topic}%`);
    }

    if (filter?.tag) {
      query += " AND tags LIKE ?";
      params.push(`%${filter.tag.toLowerCase()}%`);
    }

    if (filter?.query) {
      query += " AND (topic LIKE ? OR content LIKE ? OR tags LIKE ?)";
      params.push(`%${filter.query}%`, `%${filter.query}%`, `%${filter.query}%`);
    }

    query += " ORDER BY importance DESC, updated_at DESC";

    const stmt = db.prepare(query);
    return (stmt.all(...params) as any[]) || [];
  }

  /**
   * Updates an existing memory item with security validation.
   */
  static updateMemory(
    id: number,
    content: string,
    tags?: string[]
  ): { success: boolean; message: string } {
    if (!content) {
      return { success: false, message: "Memory content cannot be empty." };
    }

    if (this.containsSensitiveData(content)) {
      return {
        success: false,
        message: "Security violation: Sensitive data cannot be stored in memory.",
      };
    }

    const db = MemoryDatabase.getDb();
    const now = new Date().toISOString();

    let stmt;
    if (tags) {
      const tagString = tags.join(",").toLowerCase();
      stmt = db.prepare(`
        UPDATE long_term_memory
        SET content = ?, tags = ?, updated_at = ?
        WHERE id = ?
      `);
      stmt.run(content.trim(), tagString, now, id);
    } else {
      stmt = db.prepare(`
        UPDATE long_term_memory
        SET content = ?, updated_at = ?
        WHERE id = ?
      `);
      stmt.run(content.trim(), now, id);
    }

    this.logAudit("UPDATE", "long_term_memory", String(id), `Updated memory ID: ${id}`);
    return { success: true, message: `Memory ${id} updated successfully.` };
  }

  /**
   * Deletes a memory item by ID.
   */
  static deleteMemory(id: number): { success: boolean; message: string } {
    const db = MemoryDatabase.getDb();
    const stmt = db.prepare("DELETE FROM long_term_memory WHERE id = ?");
    stmt.run(id);

    this.logAudit("DELETE", "long_term_memory", String(id), `Deleted memory ID: ${id}`);
    return { success: true, message: `Memory ${id} deleted successfully.` };
  }

  /**
   * Returns memories for user review.
   */
  static reviewMemories(): {
    profile: UserProfileRecord[];
    preferences: UserPreferenceRecord[];
    longTermMemories: LongTermMemoryRecord[];
    assistantIdentity: AssistantIdentityRecord[];
  } {
    const db = MemoryDatabase.getDb();
    const profile = (db.prepare("SELECT * FROM user_profile").all() as any[]) || [];
    const preferences = (db.prepare("SELECT * FROM user_preferences").all() as any[]) || [];
    const longTermMemories = (db.prepare("SELECT * FROM long_term_memory ORDER BY updated_at DESC").all() as any[]) || [];
    const assistantIdentity = (db.prepare("SELECT * FROM assistant_identity").all() as any[]) || [];

    this.logAudit("REVIEW", "all", undefined, "User reviewed memory system");

    return {
      profile,
      preferences,
      longTermMemories,
      assistantIdentity,
    };
  }

  /**
   * Allows the user to correct a memory item.
   */
  static correctMemory(
    id: number,
    updatedContent: string
  ): { success: boolean; message: string } {
    const res = this.updateMemory(id, updatedContent);
    if (res.success) {
      this.logAudit("CORRECT", "long_term_memory", String(id), `User corrected memory ${id}`);
    }
    return res;
  }

  // ===========================================================================
  // PROFILE & PREFERENCE EDITING
  // ===========================================================================

  static getProfile(): UserProfileRecord[] {
    const db = MemoryDatabase.getDb();
    return (db.prepare("SELECT * FROM user_profile").all() as any[]) || [];
  }

  static updateProfile(
    key: string,
    value: string
  ): { success: boolean; message: string } {
    if (this.containsSensitiveData(value)) {
      return { success: false, message: "Security violation: Cannot store sensitive credentials." };
    }

    const db = MemoryDatabase.getDb();
    const now = new Date().toISOString();
    const stmt = db.prepare(`
      INSERT INTO user_profile (key, value, category, is_editable, updated_at)
      VALUES (?, ?, 'custom', 1, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);
    stmt.run(key, value, now);

    this.logAudit("UPDATE", "user_profile", key, `Updated profile key: "${key}"`);
    return { success: true, message: `Profile updated: ${key} = ${value}` };
  }

  // ===========================================================================
  // ACTIVE TASK CONTEXT (RESUMPTION & ARCHIVING)
  // ===========================================================================

  static saveTaskContext(
    taskId: string,
    goal: string,
    currentStep: number,
    stepResults: Record<string, any> = {}
  ): void {
    const db = MemoryDatabase.getDb();
    const now = new Date().toISOString();
    const stmt = db.prepare(`
      INSERT INTO active_task_context (task_id, goal, current_step, step_results, is_active, updated_at)
      VALUES (?, ?, ?, ?, 1, ?)
      ON CONFLICT(task_id) DO UPDATE SET
        current_step = excluded.current_step,
        step_results = excluded.step_results,
        is_active = 1,
        updated_at = excluded.updated_at
    `);
    stmt.run(taskId, goal, currentStep, JSON.stringify(stepResults), now);
  }

  static getActiveTaskContext(): ActiveTaskContextRecord | undefined {
    const db = MemoryDatabase.getDb();
    return db.prepare("SELECT * FROM active_task_context WHERE is_active = 1 ORDER BY updated_at DESC LIMIT 1").get() as any;
  }

  static archiveTaskContext(taskId: string): void {
    const db = MemoryDatabase.getDb();
    const now = new Date().toISOString();
    const stmt = db.prepare(`
      UPDATE active_task_context
      SET is_active = 0, updated_at = ?
      WHERE task_id = ?
    `);
    stmt.run(now, taskId);
    this.logAudit("ARCHIVE", "active_task_context", taskId, `Archived task: ${taskId}`);
  }

  static getAuditHistory(limit: number = 20): MemoryAuditLogRecord[] {
    const db = MemoryDatabase.getDb();
    return (db.prepare("SELECT * FROM memory_audit_log ORDER BY timestamp DESC LIMIT ?").all(limit) as any[]) || [];
  }
}
