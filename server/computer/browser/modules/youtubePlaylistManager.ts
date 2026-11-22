export interface PlaylistVideo {
  title: string;
  url: string;
  videoId: string;
  addedAt: string;
}

export interface LumaPlaylist {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  youtubePlaylistId?: string;
  videos: PlaylistVideo[];
}

/**
 * In-memory fallback playlist manager.
 * NOTE: As per Phase 0 & Phase 1 requirements, the real YouTube account is the sole
 * source of truth for playlists. Real operations execute via YouTubePlaylistService
 * against the live YouTube web UI in .chrome_profile.
 * This manager provides an in-memory session cache only (never writing to any
 * local .json file on disk) to prevent Vite hot-reload and data-loss bugs.
 */
export class YouTubePlaylistManager {
  private static inMemoryStore = new Map<string, LumaPlaylist>();

  /**
   * Creates a new playlist with the given name in memory.
   */
  static async createPlaylist(name: string): Promise<LumaPlaylist> {
    const cleanName = name.trim();
    if (!cleanName) {
      throw new Error("Playlist name cannot be empty.");
    }

    const key = cleanName.toLowerCase();
    if (this.inMemoryStore.has(key)) {
      return this.inMemoryStore.get(key)!;
    }

    const playlist: LumaPlaylist = {
      id: `pl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: cleanName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      videos: [],
    };

    this.inMemoryStore.set(key, playlist);
    return playlist;
  }

  /**
   * Retrieves a playlist by name (case-insensitive).
   */
  static async getPlaylist(name: string): Promise<LumaPlaylist | undefined> {
    return this.inMemoryStore.get(name.trim().toLowerCase());
  }

  /**
   * Returns all stored playlists.
   */
  static async getAllPlaylists(): Promise<LumaPlaylist[]> {
    return Array.from(this.inMemoryStore.values());
  }

  /**
   * Adds one or more videos to a playlist.
   */
  static async addVideosToPlaylist(
    playlistName: string,
    videos: Array<{ title: string; url: string; videoId?: string }>
  ): Promise<{ playlist: LumaPlaylist; addedCount: number; addedVideos: PlaylistVideo[] }> {
    const cleanName = playlistName.trim();
    const key = cleanName.toLowerCase();

    let playlist = this.inMemoryStore.get(key);
    if (!playlist) {
      playlist = await this.createPlaylist(cleanName);
      this.inMemoryStore.set(key, playlist);
    }

    const now = new Date().toISOString();
    const addedVideos: PlaylistVideo[] = [];

    for (const v of videos) {
      if (!v.url) continue;
      const videoId = v.videoId || this.extractVideoId(v.url) || `vid_${Math.random().toString(36).substring(2, 7)}`;
      
      // Avoid duplicate entry of exact same videoId
      const exists = playlist.videos.some((existing) => existing.videoId === videoId);
      if (!exists) {
        const item: PlaylistVideo = {
          title: v.title || "YouTube Video",
          url: v.url,
          videoId,
          addedAt: now,
        };
        playlist.videos.push(item);
        addedVideos.push(item);
      }
    }

    playlist.updatedAt = now;
    this.inMemoryStore.set(key, playlist);

    return {
      playlist,
      addedCount: addedVideos.length,
      addedVideos,
    };
  }

  /**
   * Removes a video from a playlist by index or title/URL matching.
   */
  static async removeVideoFromPlaylist(
    playlistName: string,
    identifier: string
  ): Promise<{ success: boolean; removedVideo?: PlaylistVideo; message: string }> {
    const key = playlistName.trim().toLowerCase();
    let playlist = this.inMemoryStore.get(key);

    // Generic fallback if user said "remove a video from a playlist" without specifying name
    if (!playlist && (key === "a playlist" || key === "playlist" || key === "the playlist")) {
      const all = Array.from(this.inMemoryStore.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      if (all.length > 0) {
        playlist = all[0];
      }
    }

    if (!playlist) {
      return {
        success: false,
        message: `Playlist "${playlistName}" does not exist.`,
      };
    }

    if (playlist.videos.length === 0) {
      return {
        success: false,
        message: `Playlist "${playlist.name}" is already empty.`,
      };
    }

    let removeIndex = -1;
    const cleanId = identifier.trim().toLowerCase();

    // Check ordinal and generic keywords: "first", "second", "last", "a video", etc.
    if (
      cleanId === "first" ||
      cleanId === "1st" ||
      cleanId === "first video" ||
      cleanId === "a video" ||
      cleanId === "video" ||
      cleanId === "one"
    ) {
      removeIndex = 0;
    } else if (cleanId === "last" || cleanId === "last video") {
      removeIndex = playlist.videos.length - 1;
    } else {
      // Match by title substring or video ID
      removeIndex = playlist.videos.findIndex(
        (v) =>
          v.title.toLowerCase().includes(cleanId) ||
          v.videoId.toLowerCase() === cleanId ||
          cleanId.includes(v.videoId.toLowerCase())
      );
    }

    if (removeIndex === -1) {
      return {
        success: false,
        message: `Could not find a video matching "${identifier}" in playlist "${playlist.name}".`,
      };
    }

    const [removed] = playlist.videos.splice(removeIndex, 1);
    playlist.updatedAt = new Date().toISOString();
    this.inMemoryStore.set(key, playlist);

    return {
      success: true,
      removedVideo: removed,
      message: `Removed "${removed.title}" from playlist "${playlist.name}".`,
    };
  }

  /**
   * Deletes an entire playlist from in-memory cache.
   */
  static async deletePlaylist(name: string): Promise<boolean> {
    const key = name.trim().toLowerCase();
    if (this.inMemoryStore.has(key)) {
      this.inMemoryStore.delete(key);
      return true;
    }
    return false;
  }

  private static extractVideoId(url: string): string {
    try {
      const u = new URL(url);
      if (u.hostname.includes("youtu.be")) {
        return u.pathname.replace(/^\//, "");
      }
      return u.searchParams.get("v") || "";
    } catch {
      const match = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
      return match ? match[1] : "";
    }
  }
}
