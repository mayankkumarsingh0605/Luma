import type { IntentMatchResult } from "./types.js";

/**
 * Evaluates file and folder control intents (OPEN_FOLDER, CREATE_FOLDER, OPEN_FILE, DELETE).
 */
export function matchFileIntent(normalizedText: string, rawText: string): IntentMatchResult | null {
  const text = normalizedText.trim();
  const raw = rawText.trim();

  // 1. DELETE operations (Destructive - requires confirmation)
  // e.g. "delete this file", "delete report.pdf", "delete folder Luma", "delete the folder", "delete report.txt"
  const deleteMatch = text.match(/^(?:delete|remove|erase)\s+(?:the\s+|this\s+)?(?:file\s+|folder\s+)?(.+)$/i);
  if (deleteMatch) {
    const target = deleteMatch[1].trim();
    return {
      matched: true,
      intent: "DELETE",
      ruleName: "RULE_DELETE_PATH",
      arguments: {
        target,
        requiresConfirmation: true,
      },
      toolToExecute: "delete_path",
    };
  }

  // Hindi delete: "report.pdf delete karo", "folder luma delete kardo", "isko delete karo"
  const hinglishDelete = raw.match(/^(.+?)\s+(?:delete\s*karo|delete\s*kardo|delete\s*kar\s*do|hatao)$/i);
  if (hinglishDelete) {
    const target = hinglishDelete[1].trim();
    return {
      matched: true,
      intent: "DELETE",
      ruleName: "RULE_DELETE_PATH",
      arguments: {
        target,
        requiresConfirmation: true,
      },
      toolToExecute: "delete_path",
    };
  }

  // 2. CREATE_FOLDER operations
  // e.g. "create a folder called Luma", "create a folder named Projects on Desktop", "create folder Luma", "make folder Luma"
  const createFolderMatch = text.match(
    /^(?:create|make|new)\s+(?:a\s+)?folder\s+(?:called|named)?\s*(.+)$/i
  );
  if (createFolderMatch) {
    const folderSpec = createFolderMatch[1].trim();
    return {
      matched: true,
      intent: "CREATE_FOLDER",
      ruleName: "RULE_CREATE_FOLDER",
      arguments: {
        folder: folderSpec,
      },
      toolToExecute: "create_folder",
    };
  }

  // Hindi: "Luma naam ka folder banao", "folder banao Luma"
  const hinglishCreateFolder = raw.match(/^(?:folder\s+banao\s+(.+)|(.+?)\s+(?:naam\s+ka\s+folder\s+banao|folder\s+banao))$/i);
  if (hinglishCreateFolder) {
    const folderSpec = (hinglishCreateFolder[1] || hinglishCreateFolder[2] || "").trim();
    return {
      matched: true,
      intent: "CREATE_FOLDER",
      ruleName: "RULE_CREATE_FOLDER",
      arguments: {
        folder: folderSpec,
      },
      toolToExecute: "create_folder",
    };
  }

  // 3. OPEN_FOLDER operations (Downloads, Documents, Desktop, Pictures, Music, Videos)
  // e.g. "open my downloads folder", "open downloads", "open documents", "take me to desktop", "show desktop"
  const specialFolderMatch = text.match(
    /^(?:open|show|go\s+to|take\s+me\s+to)\s+(?:my\s+)?(downloads|download|documents|document|desktop|pictures|pics|music|videos)(?:\s+folder)?$/i
  );
  if (specialFolderMatch) {
    const folder = specialFolderMatch[1].toLowerCase().trim();
    return {
      matched: true,
      intent: "OPEN_FOLDER",
      ruleName: "RULE_OPEN_SPECIAL_FOLDER",
      arguments: {
        folder,
        path: folder,
      },
      toolToExecute: "open_path",
    };
  }

  // Hindi special folder: "downloads kholo", "documents open karo", "desktop kholo", "desktop pe jao"
  const hinglishSpecialFolder = raw.match(
    /^(downloads|documents|desktop|pictures|music|videos)\s+(?:kholo|khol\s*do|open\s*karo|pe\s*jao|par\s*jao)$/i
  );
  if (hinglishSpecialFolder) {
    const folder = hinglishSpecialFolder[1].toLowerCase().trim();
    return {
      matched: true,
      intent: "OPEN_FOLDER",
      ruleName: "RULE_OPEN_SPECIAL_FOLDER",
      arguments: {
        folder,
        path: folder,
      },
      toolToExecute: "open_path",
    };
  }

  // 4. OPEN_FILE operations (e.g. "open report.pdf", "open file notes.txt")
  const openFileMatch = text.match(/^(?:open|launch)\s+(?:file\s+)?(.+?\.[a-zA-Z0-9]{2,5})$/i);
  if (openFileMatch) {
    const fileName = openFileMatch[1].trim();
    return {
      matched: true,
      intent: "OPEN_FILE",
      ruleName: "RULE_OPEN_FILE",
      arguments: {
        path: fileName,
      },
      toolToExecute: "open_path",
    };
  }

  return null;
}
