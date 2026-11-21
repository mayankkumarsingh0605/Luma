import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const userProfile = process.env.USERPROFILE || "C:\\Users\\" + (process.env.USERNAME || "Default");

export const SPECIAL_FOLDERS: Record<string, string> = {
  downloads: path.join(userProfile, "Downloads"),
  download: path.join(userProfile, "Downloads"),
  documents: path.join(userProfile, "Documents"),
  document: path.join(userProfile, "Documents"),
  docs: path.join(userProfile, "Documents"),
  desktop: path.join(userProfile, "Desktop"),
  pictures: path.join(userProfile, "Pictures"),
  pics: path.join(userProfile, "Pictures"),
  music: path.join(userProfile, "Music"),
  videos: path.join(userProfile, "Videos"),
};

export class FileController {
  /**
   * Resolves a folder or file path, expanding special aliases if needed.
   */
  static resolvePath(inputPath: string): string {
    const clean = inputPath.trim().replace(/^['"]|['"]$/g, "");
    const lower = clean.toLowerCase();

    // Check special folder aliases
    if (SPECIAL_FOLDERS[lower]) {
      return SPECIAL_FOLDERS[lower];
    }

    // Check if it's already an absolute Windows path (e.g. C:\...)
    if (path.isAbsolute(clean)) {
      return clean;
    }

    // Check if it starts with ~/ or Desktop/ etc.
    if (clean.startsWith("~")) {
      return path.join(userProfile, clean.slice(1).replace(/^[/\\]+/, ""));
    }

    // Default relative paths to Desktop for easy user interaction
    return path.join(userProfile, "Desktop", clean);
  }

  /**
   * Opens a file or folder using the Windows default handler or File Explorer.
   */
  static async openPath(targetPath: string): Promise<{ success: boolean; message: string; path: string }> {
    if (!targetPath || !targetPath.trim()) {
      throw new Error("Path is required.");
    }

    const resolved = this.resolvePath(targetPath);

    // If path doesn't exist, check if it exists in Downloads or Documents as fallback
    let finalPath = resolved;
    if (!fs.existsSync(finalPath)) {
      const inDownloads = path.join(userProfile, "Downloads", targetPath.trim());
      const inDocuments = path.join(userProfile, "Documents", targetPath.trim());
      if (fs.existsSync(inDownloads)) {
        finalPath = inDownloads;
      } else if (fs.existsSync(inDocuments)) {
        finalPath = inDocuments;
      } else {
        throw new Error(`File or folder not found: "${targetPath}".`);
      }
    }

    const stat = fs.statSync(finalPath);
    if (stat.isDirectory()) {
      // Open in Windows Explorer
      await execAsync(`explorer.exe "${finalPath}"`);
      return {
        success: true,
        message: `Opened folder "${path.basename(finalPath)}" in File Explorer.`,
        path: finalPath,
      };
    } else {
      // Open file with default registered application
      await execAsync(`cmd.exe /c start "" "${finalPath}"`);
      return {
        success: true,
        message: `Opened file "${path.basename(finalPath)}" successfully.`,
        path: finalPath,
      };
    }
  }

  /**
   * Creates a directory at the given path safely.
   */
  static async createFolder(folderNameOrPath: string): Promise<{ success: boolean; message: string; path: string }> {
    if (!folderNameOrPath || !folderNameOrPath.trim()) {
      throw new Error("Folder name or path is required.");
    }

    const targetPath = this.resolvePath(folderNameOrPath);

    if (fs.existsSync(targetPath)) {
      return {
        success: true,
        message: `Folder "${path.basename(targetPath)}" already exists at ${targetPath}.`,
        path: targetPath,
      };
    }

    fs.mkdirSync(targetPath, { recursive: true });

    return {
      success: true,
      message: `Folder "${path.basename(targetPath)}" created successfully.`,
      path: targetPath,
    };
  }

  /**
   * Deletes a file or directory safely.
   */
  static async deletePath(targetNameOrPath: string): Promise<{ success: boolean; message: string; path: string }> {
    if (!targetNameOrPath || !targetNameOrPath.trim()) {
      throw new Error("Target name or path is required.");
    }

    const targetPath = this.resolvePath(targetNameOrPath);

    let finalPath = targetPath;
    if (!fs.existsSync(finalPath)) {
      const inDownloads = path.join(userProfile, "Downloads", targetNameOrPath.trim());
      const inDocuments = path.join(userProfile, "Documents", targetNameOrPath.trim());
      if (fs.existsSync(inDownloads)) {
        finalPath = inDownloads;
      } else if (fs.existsSync(inDocuments)) {
        finalPath = inDocuments;
      } else {
        throw new Error(`Cannot delete: "${targetNameOrPath}" does not exist.`);
      }
    }

    const stat = fs.statSync(finalPath);
    if (stat.isDirectory()) {
      fs.rmSync(finalPath, { recursive: true, force: true });
      return {
        success: true,
        message: `Folder "${path.basename(finalPath)}" was deleted successfully.`,
        path: finalPath,
      };
    } else {
      fs.unlinkSync(finalPath);
      return {
        success: true,
        message: `File "${path.basename(finalPath)}" was deleted successfully.`,
        path: finalPath,
      };
    }
  }
}
