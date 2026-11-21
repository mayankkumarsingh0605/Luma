/**
 * LUMA App Alias Registry (Phase 2)
 *
 * Standardizes natural language references to applications into canonical names
 * recognizable by the existing AppRegistry and ToolExecutor.
 */

export interface AppAliasEntry {
  canonical: string;
  displayName: string;
  aliases: string[];
}

export const APP_ALIASES: AppAliasEntry[] = [
  {
    canonical: "chrome",
    displayName: "Google Chrome",
    aliases: ["google chrome", "chrome", "googlechrome", "chrome browser", "browser"],
  },
  {
    canonical: "edge",
    displayName: "Microsoft Edge",
    aliases: ["microsoft edge", "ms edge", "edge browser", "edge"],
  },
  {
    canonical: "vscode",
    displayName: "Visual Studio Code",
    aliases: ["visual studio code", "vs code", "vscode", "code editor", "code"],
  },
  {
    canonical: "notepad",
    displayName: "Notepad",
    aliases: ["notepad", "notes", "text editor"],
  },
  {
    canonical: "paint",
    displayName: "Paint",
    aliases: ["mspaint", "paint", "ms paint", "drawing", "microsoft paint"],
  },
  {
    canonical: "clock",
    displayName: "Clock",
    aliases: ["clock", "alarms", "alarm", "stopwatch", "timer", "windows clock"],
  },
  {
    canonical: "photos",
    displayName: "Photos",
    aliases: ["photos", "photo viewer", "image viewer", "windows photos", "pictures"],
  },
  {
    canonical: "calc",
    displayName: "Calculator",
    aliases: ["calculator", "calc", "windows calculator"],
  },
  {
    canonical: "explorer",
    displayName: "File Explorer",
    aliases: ["file explorer", "explorer", "files", "my files"],
  },
  {
    canonical: "cmd",
    displayName: "Command Prompt",
    aliases: ["command prompt", "cmd"],
  },
  {
    canonical: "terminal",
    displayName: "PowerShell",
    aliases: ["powershell", "terminal", "powershell terminal", "ps"],
  },
  {
    canonical: "discord",
    displayName: "Discord",
    aliases: ["discord"],
  },
  {
    canonical: "spotify",
    displayName: "Spotify",
    aliases: ["spotify", "music"],
  },
  {
    canonical: "whatsapp",
    displayName: "WhatsApp",
    aliases: ["whatsapp"],
  },
  {
    canonical: "telegram",
    displayName: "Telegram",
    aliases: ["telegram", "tg"],
  },
];

/**
 * Resolves a text fragment to an application alias if one exists.
 * Matches longest alias first to prevent partial shadowing.
 */
export function resolveAppAlias(
  text: string
): { canonical: string; matchedAlias: string; displayName: string } | null {
  const clean = text.toLowerCase().trim();
  if (!clean) return null;

  // Flatten and sort all aliases by length descending
  const candidates: { canonical: string; alias: string; displayName: string }[] = [];
  for (const entry of APP_ALIASES) {
    for (const alias of entry.aliases) {
      candidates.push({
        canonical: entry.canonical,
        alias: alias.toLowerCase().trim(),
        displayName: entry.displayName,
      });
    }
  }

  candidates.sort((a, b) => b.alias.length - a.alias.length);

  for (const candidate of candidates) {
    // Exact match
    if (clean === candidate.alias) {
      return {
        canonical: candidate.canonical,
        matchedAlias: candidate.alias,
        displayName: candidate.displayName,
      };
    }

    // Match as distinct word boundary in the string
    const regex = new RegExp(`(^|\\s)${candidate.alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`, "i");
    if (regex.test(clean)) {
      return {
        canonical: candidate.canonical,
        matchedAlias: candidate.alias,
        displayName: candidate.displayName,
      };
    }
  }

  return null;
}
