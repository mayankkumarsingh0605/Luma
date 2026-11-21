import { WindowsBridge } from "../native/windowsBridge.js";
import type { MousePosition } from "../types.js";

export class MouseController {
  /**
   * Moves mouse cursor to specified coordinates (x, y).
   */
  static async moveMouse(x: number, y: number): Promise<{ position: MousePosition; message: string }> {
    if (typeof x !== "number" || typeof y !== "number" || isNaN(x) || isNaN(y)) {
      throw new Error("Coordinates x and y must be valid numbers.");
    }

    const bounds = await WindowsBridge.getScreenBounds();
    const clampedX = Math.max(0, Math.min(bounds.width - 1, x));
    const clampedY = Math.max(0, Math.min(bounds.height - 1, y));

    await WindowsBridge.setMousePosition(clampedX, clampedY);

    return {
      position: { x: clampedX, y: clampedY },
      message: `Mouse moved to (${clampedX}, ${clampedY}).`,
    };
  }

  /**
   * Performs a single mouse click at the current cursor position.
   */
  static async click(button: "left" | "right" | "middle" = "left"): Promise<{ button: string; message: string }> {
    await WindowsBridge.mouseClick(button);
    return {
      button,
      message: `${button.toUpperCase()} click executed at current cursor position.`,
    };
  }

  /**
   * Performs a double-click at the current cursor position.
   */
  static async doubleClick(): Promise<{ message: string }> {
    await WindowsBridge.mouseClick("double");
    return {
      message: "Double-click executed at current cursor position.",
    };
  }

  /**
   * Performs a right-click at the current cursor position.
   */
  static async rightClick(): Promise<{ message: string }> {
    await WindowsBridge.mouseClick("right");
    return {
      message: "Right-click executed at current cursor position.",
    };
  }

  /**
   * Performs mouse wheel scroll.
   * Positive amount = Scroll UP, Negative amount = Scroll DOWN.
   */
  static async scroll(amount: number): Promise<{ amount: number; direction: "up" | "down"; message: string }> {
    if (typeof amount !== "number" || isNaN(amount)) {
      throw new Error("Scroll amount must be a valid number.");
    }

    await WindowsBridge.mouseScroll(amount);
    const direction = amount >= 0 ? "up" : "down";

    return {
      amount,
      direction,
      message: `Scrolled ${Math.abs(amount)} unit(s) ${direction}.`,
    };
  }

  /**
   * Gets current mouse cursor coordinates.
   */
  static async getMousePosition(): Promise<MousePosition> {
    return await WindowsBridge.getMousePosition();
  }
}
