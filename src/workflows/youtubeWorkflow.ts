import { BrowserAgent } from "../agent/browserAgent.js";
import { ComputerStateManager } from "../state/computerState.js";
import type { WorkflowContext, WorkflowResult } from "./types.js";

/**
 * YouTube Specialized Workflow
 *
 * Implements Stage A (playback, video selection, pause/resume)
 * and Stage B (playlist creation, management, addition, playback).
 */
export async function executeYouTubeWorkflow(
  intent: string,
  args: Record<string, any>,
  context: WorkflowContext
): Promise<WorkflowResult> {
  switch (intent) {
    case "PLAY_FIRST_RESULT": {
      context.onProgress("Playing the first video result...", "in-progress");
      try {
        const res = await BrowserAgent.play_first_video(args.target || "youtube");
        if (res.success) {
          context.onProgress(res.message, "completed");
          ComputerStateManager.update({
            active_app: "chrome",
            current_url: res.url,
            last_action: res.message,
            last_action_status: "success",
          });
          return {
            success: true,
            message: res.message,
            data: { url: res.url, title: res.title },
          };
        }
        context.onProgress("Could not play the first video", "failed");
        return {
          success: false,
          message: res.message || "Could not play the first video result.",
        };
      } catch (err: any) {
        context.onProgress("Error playing first video", "failed");
        return {
          success: false,
          message: `Error playing first video: ${err?.message || "Unknown error"}`,
          error: err?.message,
        };
      }
    }

    case "YOUTUBE_CREATE_PLAYLIST": {
      const name = args.name;
      context.onProgress(`Creating playlist "${name}"...`, "in-progress");
      try {
        const res = await BrowserAgent.create_playlist(name);
        if (res.success) {
          const msg = `Created playlist "${name}".`;
          context.onProgress(msg, "completed");
          ComputerStateManager.update({
            last_action: msg,
            last_action_status: "success",
          });
          return {
            success: true,
            message: msg,
            data: res.playlist,
          };
        }
        context.onProgress(`Failed to create playlist "${name}"`, "failed");
        return {
          success: false,
          message: res.message || `Failed to create playlist "${name}".`,
        };
      } catch (err: any) {
        return {
          success: false,
          message: `Error creating playlist: ${err?.message || "Unknown error"}`,
          error: err?.message,
        };
      }
    }

    case "YOUTUBE_ADD_TO_PLAYLIST": {
      const playlistName = args.playlist_name;
      const limit = Number(args.limit) || 3;
      context.onProgress(`Adding ${limit} relevant video(s) to playlist "${playlistName}"...`, "in-progress");
      try {
        const res = await BrowserAgent.add_to_playlist(playlistName, args.videos, limit);
        if (res.success) {
          const msg = res.message || `Added ${limit} video(s) to playlist "${playlistName}".`;
          context.onProgress(msg, "completed");
          ComputerStateManager.update({
            last_action: msg,
            last_action_status: "success",
          });
          return {
            success: true,
            message: msg,
          };
        }
        context.onProgress(`Failed to add videos to playlist "${playlistName}"`, "failed");
        return {
          success: false,
          message: res.message || `Failed to add videos to playlist "${playlistName}".`,
        };
      } catch (err: any) {
        return {
          success: false,
          message: `Error adding to playlist: ${err?.message || "Unknown error"}`,
          error: err?.message,
        };
      }
    }

    case "YOUTUBE_PLAY_PLAYLIST": {
      const name = args.name;
      context.onProgress(`Starting playback of playlist "${name}"...`, "in-progress");
      try {
        const res = await BrowserAgent.play_playlist(name);
        if (res.success) {
          context.onProgress(res.message, "completed");
          ComputerStateManager.update({
            active_app: "chrome",
            current_url: res.url,
            last_action: res.message,
            last_action_status: "success",
          });
          return {
            success: true,
            message: res.message,
            data: { url: res.url },
          };
        }
        context.onProgress(`Could not play playlist "${name}"`, "failed");
        return {
          success: false,
          message: res.message || `Could not play playlist "${name}".`,
        };
      } catch (err: any) {
        return {
          success: false,
          message: `Error playing playlist: ${err?.message || "Unknown error"}`,
          error: err?.message,
        };
      }
    }

    case "YOUTUBE_OPEN_PLAYLIST": {
      const name = args.name;
      context.onProgress(`Opening playlist "${name}"...`, "in-progress");
      try {
        const res = await BrowserAgent.get_playlist(name);
        if (res.success) {
          context.onProgress(res.message, "completed");
          return {
            success: true,
            message: res.message,
            data: res.playlist,
          };
        }
        context.onProgress(`Playlist "${name}" not found`, "failed");
        return {
          success: false,
          message: res.message || `Playlist "${name}" not found.`,
        };
      } catch (err: any) {
        return {
          success: false,
          message: `Error retrieving playlist: ${err?.message || "Unknown error"}`,
          error: err?.message,
        };
      }
    }

    case "YOUTUBE_REMOVE_FROM_PLAYLIST": {
      const playlistName = args.playlist_name;
      const video = args.video;
      context.onProgress(`Removing "${video}" from playlist "${playlistName}"...`, "in-progress");
      try {
        const res = await BrowserAgent.remove_from_playlist(playlistName, video);
        if (res.success) {
          context.onProgress(res.message, "completed");
          ComputerStateManager.update({
            last_action: res.message,
            last_action_status: "success",
          });
          return {
            success: true,
            message: res.message,
          };
        }
        context.onProgress(`Failed to remove "${video}" from playlist "${playlistName}"`, "failed");
        return {
          success: false,
          message: res.message || `Failed to remove "${video}" from playlist "${playlistName}".`,
        };
      } catch (err: any) {
        return {
          success: false,
          message: `Error removing from playlist: ${err?.message || "Unknown error"}`,
          error: err?.message,
        };
      }
    }

    default:
      return {
        success: false,
        message: `Unknown YouTube intent: "${intent}".`,
      };
  }
}
