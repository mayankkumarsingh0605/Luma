import fs from "fs";
import path from "path";

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

export class YouTubePlaylistManager {
  private static readonly STORAGE_FILE = path.resolve(process.cwd(), ".luma_playlists.json");

  private static readStorage(): Record<string, LumaPlaylist> {
    try {
      if (fs.existsSync(this.STORAGE_FILE)) {
        const raw = fs.readFileSync(this.STORAGE_FILE, "utf-8");
        return JSON.parse(raw);
      }
    } catch {
      // Return empty if corrupted or unreadable
    }
    return {};
  }

  private static writeStorage(data: Record<string, LumaPlaylist>): void {
    try {
      fs.writeFileSync(this.STORAGE_FILE, JSON.stringify(data, null, 2), "utf-8");
    } catch (err: any) {
      console.error("[YouTubePlaylistManager] Error writing storage file:", err.message);
    }
  }

  /**
   * Creates a new playlist with the given name.
   */
  static async createPlaylist(name: string): Promise<LumaPlaylist> {
    const cleanName = name.trim();
    if (!cleanName) {
      throw new Error("Playlist name cannot be empty.");
    }

    const storage = this.readStorage();
    const key = cleanName.toLowerCase();

    if (storage[key]) {
      return storage[key];
    }

    const playlist: LumaPlaylist = {
      id: `pl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: cleanName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      videos: [],
    };

    storage[key] = playlist;
    this.writeStorage(storage);
    return playlist;
  }

  /**
   * Retrieves a playlist by name (case-insensitive).
   */
  static async getPlaylist(name: string): Promise<LumaPlaylist | undefined> {
    const storage = this.readStorage();
    return storage[name.trim().toLowerCase()];
  }

  /**
   * Returns all stored playlists.
   */
  static async getAllPlaylists(): Promise<LumaPlaylist[]> {
    const storage = this.readStorage();
    return Object.values(storage);
  }

  /**
   * Adds one or more videos to a playlist.
   */
  static async addVideosToPlaylist(
    playlistName: string,
    videos: Array<{ title: string; url: string; videoId?: string }>
  ): Promise<{ playlist: LumaPlaylist; addedCount: number; addedVideos: PlaylistVideo[] }> {
    const cleanName = playlistName.trim();
    const storage = this.readStorage();
    const key = cleanName.toLowerCase();

    let playlist = storage[key];
    if (!playlist) {
      playlist = await this.createPlaylist(cleanName);
      storage[key] = playlist;
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
    storage[key] = playlist;
    this.writeStorage(storage);

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
    const storage = this.readStorage();
    const key = playlistName.trim().toLowerCase();
    let playlist = storage[key];

    // Generic fallback if user said "remove a video from a playlist" without specifying name
    if (!playlist && (key === "a playlist" || key === "playlist" || key === "the playlist")) {
      const all = Object.values(storage).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
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
    storage[key] = playlist;
    this.writeStorage(storage);

    return {
      success: true,
      removedVideo: removed,
      message: `Removed "${removed.title}" from playlist "${playlist.name}".`,
    };
  }

  /**
   * Deletes an entire playlist.
   */
  static async deletePlaylist(name: string): Promise<boolean> {
    const storage = this.readStorage();
    const key = name.trim().toLowerCase();
    if (storage[key]) {
      delete storage[key];
      this.writeStorage(storage);
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
