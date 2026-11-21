import { WindowsBridge } from "../native/windowsBridge.js";

export type MediaAction =
  | "play"
  | "pause"
  | "play_pause"
  | "resume"
  | "stop"
  | "next"
  | "previous"
  | "volume_up"
  | "volume_down"
  | "mute";

const VK_CODES: Record<MediaAction, number> = {
  play: 0xb3, // VK_MEDIA_PLAY_PAUSE
  pause: 0xb3,
  play_pause: 0xb3,
  resume: 0xb3,
  stop: 0xb2, // VK_MEDIA_STOP
  next: 0xb0, // VK_MEDIA_NEXT_TRACK
  previous: 0xb1, // VK_MEDIA_PREV_TRACK
  volume_up: 0xaf, // VK_VOLUME_UP
  volume_down: 0xae, // VK_VOLUME_DOWN
  mute: 0xad, // VK_VOLUME_MUTE
};

export class MediaController {
  /**
   * Executes a native Windows media or volume action via keybd_event.
   */
  static async executeMediaAction(action: MediaAction): Promise<{ success: boolean; message: string; action: string }> {
    const vk = VK_CODES[action];
    if (!vk) {
      throw new Error(`Unsupported media action: "${action}".`);
    }

    const script = `
$code = @"
using System;
using System.Runtime.InteropServices;
public class WinMedia {
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);
}
"@
if (-not ([System.Management.Automation.PSTypeName]'WinMedia').Type) {
    Add-Type -TypeDefinition $code
}
[WinMedia]::keybd_event(${vk}, 0, 0, 0)       # KEY DOWN
Start-Sleep -Milliseconds 50
[WinMedia]::keybd_event(${vk}, 0, 0x0002, 0)  # KEY UP (KEYEVENTF_KEYUP = 2)
`;

    await WindowsBridge.runPowerShell(script);

    const friendlyMessages: Record<MediaAction, string> = {
      play: "Media playback started.",
      pause: "Media paused.",
      play_pause: "Media play/pause toggled.",
      resume: "Media resumed.",
      stop: "Media playback stopped.",
      next: "Skipped to next track.",
      previous: "Returned to previous track.",
      volume_up: "Volume increased.",
      volume_down: "Volume decreased.",
      mute: "Volume muted/unmuted.",
    };

    return {
      success: true,
      message: friendlyMessages[action] || `Media action "${action}" executed.`,
      action,
    };
  }
}
