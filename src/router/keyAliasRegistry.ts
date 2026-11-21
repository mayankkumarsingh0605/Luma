/**
 * LUMA Keyboard Key Alias Registry (Milestone 2.1)
 *
 * Maps natural language wording for keys to canonical key names used by the
 * existing Tool Executor and WindowsBridge.
 */

export interface KeyAliasEntry {
  canonical: string;
  displayName: string;
  aliases: string[];
}

export const KEY_ALIASES: KeyAliasEntry[] = [
  {
    canonical: "ENTER",
    displayName: "Enter",
    aliases: ["enter", "return", "ent"],
  },
  {
    canonical: "ESCAPE",
    displayName: "Escape",
    aliases: ["escape", "esc"],
  },
  {
    canonical: "TAB",
    displayName: "Tab",
    aliases: ["tab"],
  },
  {
    canonical: "BACKSPACE",
    displayName: "Backspace",
    aliases: ["backspace", "back space", "bksp"],
  },
  {
    canonical: "SPACE",
    displayName: "Space",
    aliases: ["space", "spacebar", "space bar"],
  },
  {
    canonical: "DELETE",
    displayName: "Delete",
    aliases: ["delete", "del"],
  },
  {
    canonical: "UP",
    displayName: "Up Arrow",
    aliases: ["up", "arrow up", "up arrow"],
  },
  {
    canonical: "DOWN",
    displayName: "Down Arrow",
    aliases: ["down", "arrow down", "down arrow"],
  },
  {
    canonical: "LEFT",
    displayName: "Left Arrow",
    aliases: ["left", "arrow left", "left arrow"],
  },
  {
    canonical: "RIGHT",
    displayName: "Right Arrow",
    aliases: ["right", "arrow right", "right arrow"],
  },
];

/**
 * Resolves a text fragment to a canonical key alias.
 * Matches longest alias first.
 */
export function resolveKeyAlias(
  text: string
): { canonical: string; displayName: string; matchedAlias: string } | null {
  const clean = text.toLowerCase().trim();
  if (!clean) return null;

  // Flatten and sort candidates by length descending
  const candidates: { canonical: string; displayName: string; alias: string }[] = [];
  for (const entry of KEY_ALIASES) {
    for (const alias of entry.aliases) {
      candidates.push({
        canonical: entry.canonical,
        displayName: entry.displayName,
        alias: alias.toLowerCase().trim(),
      });
    }
  }

  candidates.sort((a, b) => b.alias.length - a.alias.length);

  for (const candidate of candidates) {
    // Exact match
    if (clean === candidate.alias) {
      return {
        canonical: candidate.canonical,
        displayName: candidate.displayName,
        matchedAlias: candidate.alias,
      };
    }

    // Match as word boundary in string
    const regex = new RegExp(`(^|\\s)${candidate.alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`, "i");
    if (regex.test(clean)) {
      return {
        canonical: candidate.canonical,
        displayName: candidate.displayName,
        matchedAlias: candidate.alias,
      };
    }
  }

  return null;
}
