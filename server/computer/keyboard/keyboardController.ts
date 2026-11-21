import { WindowsBridge } from "../native/windowsBridge.js";

/**
 * Key mappings for Windows SendKeys
 */
const SPECIAL_KEYS: Record<string, string> = {
  enter: "{ENTER}",
  return: "{ENTER}",
  esc: "{ESC}",
  escape: "{ESC}",
  tab: "{TAB}",
  backspace: "{BACKSPACE}",
  bksp: "{BACKSPACE}",
  delete: "{DELETE}",
  del: "{DELETE}",
  space: " ",
  up: "{UP}",
  down: "{DOWN}",
  left: "{LEFT}",
  right: "{RIGHT}",
  home: "{HOME}",
  end: "{END}",
  pageup: "{PGUP}",
  pagedown: "{PGDN}",
  insert: "{INSERT}",
  ins: "{INSERT}",
  capslock: "{CAPSLOCK}",
  f1: "{F1}",
  f2: "{F2}",
  f3: "{F3}",
  f4: "{F4}",
  f5: "{F5}",
  f6: "{F6}",
  f7: "{F7}",
  f8: "{F8}",
  f9: "{F9}",
  f10: "{F10}",
  f11: "{F11}",
  f12: "{F12}",
};

export class KeyboardController {
  /**
   * Types plain text into the active focused window.
   */
  static async typeText(text: string): Promise<{ typedLength: number; message: string }> {
    if (typeof text !== "string" || text.length === 0) {
      throw new Error("Text parameter must be a non-empty string.");
    }

    await WindowsBridge.typeText(text);
    return {
      typedLength: text.length,
      message: `Typed ${text.length} characters successfully.`,
    };
  }

  /**
   * Presses a single keyboard key (such as Enter, Escape, Tab, Backspace).
   */
  static async pressKey(key: string): Promise<{ key: string; message: string }> {
    if (!key || typeof key !== "string") {
      throw new Error("Key name is required.");
    }

    const cleanKey = key.toLowerCase().trim();
    const sendKeyPattern = SPECIAL_KEYS[cleanKey] || (cleanKey.length === 1 ? cleanKey : `{${cleanKey.toUpperCase()}}`);

    await WindowsBridge.sendKeyStroke(sendKeyPattern);
    return {
      key,
      message: `Key '${key}' pressed successfully.`,
    };
  }

  /**
   * Executes a keyboard combination / hotkey (e.g. ['ctrl', 'c'], ['alt', 'f4'], ['ctrl', 'shift', 'esc']).
   */
  static async hotkey(keys: string[]): Promise<{ hotkey: string; message: string }> {
    if (!Array.isArray(keys) || keys.length === 0) {
      throw new Error("Keys parameter must be a non-empty array of key strings.");
    }

    const cleanKeys = keys.map((k) => k.toLowerCase().trim());
    let prefix = "";
    let mainKey = "";

    for (const k of cleanKeys) {
      if (k === "ctrl" || k === "control") {
        prefix += "^";
      } else if (k === "alt") {
        prefix += "%";
      } else if (k === "shift") {
        prefix += "+";
      } else {
        const mapped = SPECIAL_KEYS[k] || (k.length === 1 ? k : `{${k.toUpperCase()}}`);
        mainKey = mapped;
      }
    }

    if (!mainKey && prefix) {
      // If only modifiers provided, treat last as key
      mainKey = prefix[prefix.length - 1];
      prefix = prefix.slice(0, -1);
    }

    const fullPattern = `${prefix}${mainKey}`;
    await WindowsBridge.sendKeyStroke(fullPattern);

    const comboLabel = keys.join(" + ").toUpperCase();
    return {
      hotkey: comboLabel,
      message: `Hotkey '${comboLabel}' triggered successfully.`,
    };
  }
}
