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

    case "PLAY_VIDEO_RANK": {
      const rank = Number(args.rank) || 1;
      context.onProgress(`Playing video #${rank}...`, "in-progress");
      try {
        const res = await BrowserAgent.play_video_rank(rank);
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
            data: { url: res.url, title: res.title, rank },
          };
        }
        context.onProgress(`Could not play video #${rank}`, "failed");
        return {
          success: false,
          message: res.message || `Could not play video #${rank}.`,
        };
      } catch (err: any) {
        return {
          success: false,
          message: `Error playing video: ${err?.message || "Unknown error"}`,
          error: err?.message,
        };
      }
    }

    case "YOUTUBE_CREATE_PLAYLIST": {
      const name = args.name;
      const privacy = args.privacy || "PRIVATE";
      context.onProgress(`Creating playlist "${name}" (Visibility: ${privacy})...`, "in-progress");
      try {
        const res = await BrowserAgent.create_playlist(name, privacy);
        if (res.success) {
          const msg = res.message || `Created playlist "${name}" (Visibility: ${privacy}).`;
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
        context.onProgress(res.message || `Failed to create playlist "${name}"`, "failed");
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
      const index = args.index || 1;
      const next = args.next;
      context.onProgress(`Starting playback of playlist "${name}"...`, "in-progress");
      try {
        const res = await BrowserAgent.play_playlist(name, index, next);
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
            data: { url: res.url, videoTitle: res.videoTitle },
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

    case "YOUTUBE_PLAY_PLAYLIST_VIDEO": {
      const playlistName = args.playlist_name;
      const index = args.index || 1;
      const next = args.next;
      const progressText = next
        ? "Playing next video in playlist..."
        : `Playing video #${index} in playlist "${playlistName || "active"}"...`;
      context.onProgress(progressText, "in-progress");
      try {
        const res = await BrowserAgent.play_playlist_video(playlistName, index, next);
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
            data: { url: res.url, videoTitle: res.videoTitle },
          };
        }
        context.onProgress(res.message || `Could not play video in playlist "${playlistName}".`, "failed");
        return {
          success: false,
          message: res.message || `Could not play video in playlist "${playlistName}".`,
        };
      } catch (err: any) {
        return {
          success: false,
          message: `Error playing video in playlist: ${err?.message || "Unknown error"}`,
          error: err?.message,
        };
      }
    }

    case "YOUTUBE_OPEN_PLAYLIST": {
      const name = args.name;
      context.onProgress(`Opening playlist "${name}"...`, "in-progress");
      try {
        const res = await BrowserAgent.open_playlist_ui(name);
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
        context.onProgress(res.message || `Playlist "${name}" not found`, "failed");
        return {
          success: false,
          message: res.message || `Playlist "${name}" not found in your YouTube account.`,
        };
      } catch (err: any) {
        return {
          success: false,
          message: `Error opening playlist: ${err?.message || "Unknown error"}`,
          error: err?.message,
        };
      }
    }

    case "YOUTUBE_RENAME_PLAYLIST": {
      const oldName = args.old_name;
      const newName = args.new_name;
      context.onProgress(`Renaming playlist "${oldName}" to "${newName}"...`, "in-progress");
      try {
        const res = await BrowserAgent.rename_playlist(oldName, newName);
        if (res.success) {
          context.onProgress(res.message, "completed");
          ComputerStateManager.update({
            last_action: res.message,
            last_action_status: "success",
          });
          return {
            success: true,
            message: res.message,
            data: { playlistName: res.playlistName },
          };
        }
        context.onProgress(res.message || `Failed to rename playlist "${oldName}"`, "failed");
        return {
          success: false,
          message: res.message || `Failed to rename playlist "${oldName}".`,
        };
      } catch (err: any) {
        return {
          success: false,
          message: `Error renaming playlist: ${err?.message || "Unknown error"}`,
          error: err?.message,
        };
      }
    }

    case "YOUTUBE_UPDATE_PLAYLIST_PRIVACY": {
      const playlistName = args.playlist_name;
      const privacy = args.privacy;
      context.onProgress(`Updating privacy of "${playlistName}" to ${privacy}...`, "in-progress");
      try {
        const res = await BrowserAgent.update_playlist_privacy(playlistName, privacy);
        if (res.success) {
          context.onProgress(res.message, "completed");
          ComputerStateManager.update({
            last_action: res.message,
            last_action_status: "success",
          });
          return {
            success: true,
            message: res.message,
            data: { privacy: res.privacy },
          };
        }
        context.onProgress(res.message || `Failed to update privacy of "${playlistName}"`, "failed");
        return {
          success: false,
          message: res.message || `Failed to update privacy of "${playlistName}".`,
        };
      } catch (err: any) {
        return {
          success: false,
          message: `Error updating playlist privacy: ${err?.message || "Unknown error"}`,
          error: err?.message,
        };
      }
    }

    case "YOUTUBE_SEARCH_AND_ADD_TO_PLAYLIST": {
      const query = args.query;
      const rank = Number(args.rank) || 1;
      const playlistName = args.playlist_name;
      context.onProgress(`Searching YouTube for "${query}" and adding video #${rank} to "${playlistName}"...`, "in-progress");
      try {
        const res = await BrowserAgent.add_search_result_to_playlist(query, rank, playlistName);
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
        context.onProgress(res.message || `Failed to add search result to "${playlistName}"`, "failed");
        return {
          success: false,
          message: res.message || `Failed to add search result to "${playlistName}".`,
        };
      } catch (err: any) {
        return {
          success: false,
          message: `Error in search and add: ${err?.message || "Unknown error"}`,
          error: err?.message,
        };
      }
    }

    case "YOUTUBE_GET_PLAYLIST_DETAILS": {
      const name = args.name;
      context.onProgress(`Retrieving details for playlist "${name}"...`, "in-progress");
      try {
        const res = await BrowserAgent.get_playlist_details(name);
        if (res.success) {
          context.onProgress(res.message, "completed");
          return {
            success: true,
            message: res.message,
            data: res.details,
          };
        }
        context.onProgress(res.message || `Could not retrieve details for "${name}"`, "failed");
        return {
          success: false,
          message: res.message || `Could not retrieve details for "${name}".`,
        };
      } catch (err: any) {
        return {
          success: false,
          message: `Error retrieving playlist details: ${err?.message || "Unknown error"}`,
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

    case "YOUTUBE_SEEK": {
      const seconds = Number(args.seconds) || 10;
      const dirStr = seconds >= 0 ? `forward ${seconds}s` : `backward ${Math.abs(seconds)}s`;
      context.onProgress(`Seeking video ${dirStr}...`, "in-progress");
      try {
        const res = await BrowserAgent.seek_video(seconds);
        if (res.success) {
          context.onProgress(res.message, "completed");
          ComputerStateManager.update({
            last_action: res.message,
            last_action_status: "success",
          });
          return {
            success: true,
            message: res.message,
            data: res.details,
          };
        }
        context.onProgress(res.message, "failed");
        return {
          success: false,
          message: res.message,
        };
      } catch (err: any) {
        return {
          success: false,
          message: `Seek failed: ${err?.message || "Unknown error"}`,
          error: err?.message,
        };
      }
    }

    case "YOUTUBE_GET_VIDEO_INFO": {
      context.onProgress("Retrieving playing video information...", "in-progress");
      try {
        const res = await BrowserAgent.get_video_info();
        if (res.success) {
          context.onProgress(res.message, "completed");
          return {
            success: true,
            message: res.message,
            data: res.info,
          };
        }
        context.onProgress(res.message, "failed");
        return {
          success: false,
          message: res.message,
        };
      } catch (err: any) {
        return {
          success: false,
          message: `Could not retrieve video info: ${err?.message || "Unknown error"}`,
          error: err?.message,
        };
      }
    }

    case "YOUTUBE_GET_PLAYBACK_STATE": {
      context.onProgress("Detecting playback state...", "in-progress");
      try {
        const res = await BrowserAgent.get_playback_state();
        if (res.success) {
          context.onProgress(res.message, "completed");
          return {
            success: true,
            message: res.message,
            data: res.state,
          };
        }
        context.onProgress(res.message, "failed");
        return {
          success: false,
          message: res.message,
        };
      } catch (err: any) {
        return {
          success: false,
          message: `Could not detect playback state: ${err?.message || "Unknown error"}`,
          error: err?.message,
        };
      }
    }

    case "YOUTUBE_SET_FULLSCREEN": {
      const enable = args.enable !== undefined ? Boolean(args.enable) : undefined;
      context.onProgress("Toggling fullscreen mode...", "in-progress");
      try {
        const res = await BrowserAgent.set_fullscreen(enable);
        if (res.success) {
          context.onProgress(res.message, "completed");
          ComputerStateManager.update({
            last_action: res.message,
            last_action_status: "success",
          });
          return {
            success: true,
            message: res.message,
            data: { isFullscreen: res.isFullscreen },
          };
        }
        context.onProgress(res.message, "failed");
        return {
          success: false,
          message: res.message,
        };
      } catch (err: any) {
        return {
          success: false,
          message: `Fullscreen control failed: ${err?.message || "Unknown error"}`,
          error: err?.message,
        };
      }
    }

    case "YOUTUBE_STOP": {
      context.onProgress("Stopping video playback...", "in-progress");
      try {
        const res = await BrowserAgent.stop_video();
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
        context.onProgress(res.message, "failed");
        return {
          success: false,
          message: res.message,
        };
      } catch (err: any) {
        return {
          success: false,
          message: `Stop video failed: ${err?.message || "Unknown error"}`,
          error: err?.message,
        };
      }
    }

    case "YOUTUBE_SKIP_AD": {
      context.onProgress("Checking advertisement state...", "in-progress");
      try {
        const res = await BrowserAgent.skip_ad();
        context.onProgress(res.message, res.success ? "completed" : "completed");
        return {
          success: res.success,
          message: res.message,
          data: { isAd: res.isAd, skipped: res.skipped, skippable: res.skippable },
        };
      } catch (err: any) {
        return {
          success: false,
          message: `Ad skip failed: ${err?.message || "Unknown error"}`,
          error: err?.message,
        };
      }
    }

    case "YOUTUBE_LIST_PLAYLIST_VIDEOS": {
      const name = args.name;
      context.onProgress(`Listing videos in playlist "${name}"...`, "in-progress");
      try {
        const res = await BrowserAgent.list_playlist_videos_ui(name);
        if (res.success) {
          context.onProgress(res.message, "completed");
          return {
            success: true,
            message: res.message,
            data: { videos: res.videos },
          };
        }
        context.onProgress(res.message, "failed");
        return {
          success: false,
          message: res.message,
        };
      } catch (err: any) {
        return {
          success: false,
          message: `Failed to list playlist videos: ${err?.message || "Unknown error"}`,
          error: err?.message,
        };
      }
    }

    case "YOUTUBE_GET_FULLSCREEN_STATE": {
      context.onProgress("Checking fullscreen state...", "in-progress");
      try {
        const res = await BrowserAgent.get_fullscreen_state(args.site || "youtube");
        context.onProgress(res.message, "completed");
        return {
          success: res.success,
          message: res.message,
          data: { isFullscreen: res.isFullscreen, isVideoPlaying: res.isVideoPlaying },
        };
      } catch (err: any) {
        return {
          success: false,
          message: `Could not check fullscreen state: ${err?.message || "Unknown error"}`,
          error: err?.message,
        };
      }
    }

    case "YOUTUBE_LIST_PLAYLISTS": {
      context.onProgress("Retrieving your YouTube playlists...", "in-progress");
      try {
        const res = await BrowserAgent.list_playlists();
        if (res.success) {
          context.onProgress(res.message, "completed");
          return {
            success: true,
            message: res.message,
            data: { playlists: res.playlists },
          };
        }
        context.onProgress(res.message, "failed");
        return {
          success: false,
          message: res.message,
        };
      } catch (err: any) {
        return {
          success: false,
          message: `Failed to list playlists: ${err?.message || "Unknown error"}`,
          error: err?.message,
        };
      }
    }

    case "YOUTUBE_COUNT_PLAYLIST_VIDEOS": {
      const name = args.playlist_name || args.name || "";
      context.onProgress(`Counting videos in playlist "${name}"...`, "in-progress");
      try {
        const res = await BrowserAgent.count_playlist_videos(name);
        if (res.success) {
          context.onProgress(res.message, "completed");
          return {
            success: true,
            message: res.message,
            data: { count: res.count, name: res.name, url: res.url },
          };
        }
        context.onProgress(res.message, "failed");
        return {
          success: false,
          message: res.message,
        };
      } catch (err: any) {
        return {
          success: false,
          message: `Failed to count playlist videos: ${err?.message || "Unknown error"}`,
          error: err?.message,
        };
      }
    }

    case "YOUTUBE_HELP_COMMANDS": {
      context.onProgress("Retrieving YouTube command catalog...", "in-progress");
      try {
        const res = await BrowserAgent.get_youtube_commands_help(args.category);
        context.onProgress(res.message, "completed");
        return {
          success: res.success,
          message: res.catalog || res.message,
          data: { catalog: res.catalog },
        };
      } catch (err: any) {
        return {
          success: false,
          message: `Failed to retrieve command catalog: ${err?.message || "Unknown error"}`,
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
