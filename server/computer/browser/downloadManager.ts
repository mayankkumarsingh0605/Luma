/// <reference lib="dom" />
import fs from "fs";
import path from "path";
import type { Page, Download } from "playwright-core";
import { BrowserSession } from "./browserSession.js";

export interface DownloadCandidate {
  text: string;
  url: string;
  filename: string;
  selector?: string;
}

export interface DownloadResult {
  success: boolean;
  filename?: string;
  savedPath?: string;
  fileSizeBytes?: number;
  message: string;
  error?: string;
  candidates?: DownloadCandidate[];
}

export class DownloadManager {
  /**
   * Resolves the default user Downloads directory.
   */
  static getDefaultDownloadDirectory(): string {
    const userProfile = process.env.USERPROFILE || "C:\\Users\\man31";
    const downloads = path.join(userProfile, "Downloads");
    if (!fs.existsSync(downloads)) {
      try {
        fs.mkdirSync(downloads, { recursive: true });
      } catch {
        return path.resolve(process.cwd(), "downloads");
      }
    }
    return downloads;
  }

  /**
   * Finds all download candidates on the active page matching an optional query or file extension.
   */
  static async findDownloadCandidates(
    query?: string,
    page?: Page
  ): Promise<DownloadCandidate[]> {
    const targetPage = page || (await BrowserSession.getActivePage());

    const candidates = await targetPage.evaluate((q) => {
      const results: Array<{ text: string; url: string; filename: string; selector?: string }> = [];
      const cleanQ = (q || "").toLowerCase();

      const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"));
      anchors.forEach((a) => {
        const href = a.getAttribute("href") || "";
        const text = (a.textContent || a.getAttribute("aria-label") || a.title || "").trim();
        if (!href || href.startsWith("javascript:") || href === "#") return;

        const isExplicitDownload = a.hasAttribute("download");
        const hasExt = /\.(?:pdf|zip|docx|xlsx|csv|tar|gz|txt|json|png|jpg|exe|msi)$/i.test(href);
        const hasDownloadWord = /\b(?:download|save|get)\b/i.test(text);

        if (isExplicitDownload || hasExt || hasDownloadWord) {
          const fullUrl = href.startsWith("http") ? href : new URL(href, window.location.href).href;
          let filename = a.getAttribute("download") || "";
          if (!filename) {
            const urlParts = fullUrl.split("/").pop()?.split("?")[0] || "";
            if (urlParts.includes(".")) filename = urlParts;
          }
          if (!filename) {
            filename = text.replace(/[^a-zA-Z0-9._-]/g, "_") + (hasExt ? "" : ".pdf");
          }

          const combined = `${text} ${filename} ${fullUrl}`.toLowerCase();
          if (!cleanQ || combined.includes(cleanQ) || (cleanQ.includes("pdf") && combined.includes("pdf"))) {
            results.push({
              text: text || filename,
              url: fullUrl,
              filename,
              selector: a.id ? `#${a.id}` : undefined,
            });
          }
        }
      });

      // Also search buttons with "Download"
      const buttons = Array.from(document.querySelectorAll<HTMLElement>("button, [role='button']"));
      buttons.forEach((b) => {
        const text = (b.textContent || b.getAttribute("aria-label") || "").trim();
        if (/\bdownload\b/i.test(text)) {
          if (!cleanQ || text.toLowerCase().includes(cleanQ) || (cleanQ.includes("pdf") && text.toLowerCase().includes("pdf"))) {
            results.push({
              text,
              url: window.location.href,
              filename: `${text.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`,
              selector: b.id ? `#${b.id}` : undefined,
            });
          }
        }
      });

      return results;
    }, query);

    return candidates;
  }

  /**
   * Generates a collision-safe destination filename (e.g. "report (1).pdf").
   */
  static getSafeFilePath(targetDir: string, suggestedFilename: string): string {
    const cleanName = path.basename(suggestedFilename).replace(/[/\\?%*:|"<>]/g, "_") || "downloaded_file.pdf";
    let destPath = path.join(targetDir, cleanName);

    if (!fs.existsSync(destPath)) {
      return destPath;
    }

    const ext = path.extname(cleanName);
    const base = path.basename(cleanName, ext);
    let counter = 1;

    while (fs.existsSync(destPath)) {
      destPath = path.join(targetDir, `${base} (${counter})${ext}`);
      counter++;
    }

    return destPath;
  }

  /**
   * Downloads a requested file or PDF from the current page.
   * Listens for Playwright download event, verifies file size, and reports actual saved location.
   */
  static async downloadFile(
    fileQuery: string = "pdf",
    customDir?: string,
    page?: Page
  ): Promise<DownloadResult> {
    const targetPage = page || (await BrowserSession.getActivePage());
    const candidates = await this.findDownloadCandidates(fileQuery, targetPage);

    if (candidates.length === 0) {
      return {
        success: false,
        message: `No download links or buttons found on the active page matching "${fileQuery}".`,
        error: "NO_DOWNLOADS_FOUND",
      };
    }

    // If multiple candidates and query was ambiguous
    if (candidates.length > 3 && !fileQuery.includes("first")) {
      return {
        success: false,
        message: `Found ${candidates.length} matching downloads. Please specify which document you want: ${candidates.slice(0, 3).map((c) => `"${c.text}"`).join(", ")}.`,
        candidates,
      };
    }

    const selected = candidates[0];
    const downloadDir = customDir || this.getDefaultDownloadDirectory();

    try {
      // 1. If candidate has direct http link to a PDF, we can attempt direct browser download or fetch
      let savedPath = "";
      let fileSizeBytes = 0;

      // Listen for download event in case click triggers browser download
      const downloadPromise = targetPage.waitForEvent("download", { timeout: 8000 }).catch(() => null);

      // Trigger download click or navigation
      if (selected.selector) {
        await targetPage.locator(selected.selector).first().click().catch(() => {});
      } else {
        await targetPage.evaluate((url) => {
          const a = document.createElement("a");
          a.href = url;
          a.setAttribute("download", "");
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }, selected.url);
      }

      const download = (await downloadPromise) as Download | null;

      if (download) {
        const suggested = download.suggestedFilename() || selected.filename;
        savedPath = this.getSafeFilePath(downloadDir, suggested);
        await download.saveAs(savedPath);

        const stats = fs.statSync(savedPath);
        fileSizeBytes = stats.size;
      } else if (selected.url.startsWith("http") && !selected.url.includes("javascript:")) {
        // Direct stream fetch fallback using browser cookies / session
        savedPath = this.getSafeFilePath(downloadDir, selected.filename);
        const response = await fetch(selected.url);
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          fs.writeFileSync(savedPath, Buffer.from(buffer));
          fileSizeBytes = buffer.byteLength;
        } else {
          throw new Error(`Server returned HTTP ${response.status} when requesting ${selected.url}`);
        }
      }

      // Verification: File must exist and be non-empty
      if (fs.existsSync(savedPath) && fileSizeBytes > 0) {
        return {
          success: true,
          filename: path.basename(savedPath),
          savedPath,
          fileSizeBytes,
          message: `Successfully downloaded "${path.basename(savedPath)}" (${(fileSizeBytes / 1024).toFixed(1)} KB) to ${savedPath}.`,
        };
      }

      return {
        success: false,
        message: "Download triggered, but the verified file was either missing or empty.",
        error: "EMPTY_OR_MISSING_FILE",
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Failed to download file: ${err?.message || "Unknown error"}`,
        error: err?.message,
      };
    }
  }
}
