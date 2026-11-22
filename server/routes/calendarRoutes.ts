import { Router, type Request, type Response } from "express";
import { GoogleOAuthManager } from "../calendar/googleOAuthManager.js";

export const calendarRouter = Router();

/**
 * GET /api/calendar/oauth/callback
 * Dedicated Google OAuth 2.0 browser redirect target.
 */
calendarRouter.get("/oauth/callback", async (req: Request, res: Response): Promise<void> => {
  const code = req.query.code as string;
  const state = req.query.state as string;
  const error = req.query.error as string;

  if (error) {
    res.status(400).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>LUMA - Authorization Cancelled</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #08090d; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { background: #12151e; border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 32px; max-width: 480px; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
          h2 { color: #f43f5e; margin-top: 0; }
          p { color: #94a3b8; font-size: 14px; line-height: 1.5; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>Authorization Cancelled</h2>
          <p>Google Calendar access was not granted (${error}). You can safely close this browser tab and return to LUMA.</p>
        </div>
      </body>
      </html>
    `);
    return;
  }

  if (!code || !state) {
    res.status(400).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>LUMA - Authorization Error</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #08090d; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { background: #12151e; border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 32px; max-width: 480px; text-align: center; }
          h2 { color: #f43f5e; margin-top: 0; }
          p { color: #94a3b8; font-size: 14px; line-height: 1.5; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>Missing Authorization Data</h2>
          <p>The authorization code or state token is missing. You can safely close this browser tab.</p>
        </div>
      </body>
      </html>
    `);
    return;
  }

  const result = await GoogleOAuthManager.handleCallback(code, state);

  if (result.success) {
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>LUMA - Google Calendar Connected</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #08090d; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { background: #12151e; border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 36px; max-width: 480px; text-align: center; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
          h2 { color: #10b981; margin-top: 0; font-size: 22px; }
          .badge { display: inline-block; background: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.3); color: #34d399; padding: 6px 14px; border-radius: 9999px; font-size: 13px; font-family: monospace; margin: 12px 0 18px 0; }
          p { color: #94a3b8; font-size: 14px; line-height: 1.6; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>✓ Google Calendar Connected</h2>
          <div class="badge">${result.email}</div>
          <p>Your Google Calendar account is now securely linked with LUMA. You can close this browser tab and return to the assistant.</p>
        </div>
      </body>
      </html>
    `);
  } else {
    res.status(400).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>LUMA - Connection Failed</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #08090d; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { background: #12151e; border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 32px; max-width: 480px; text-align: center; }
          h2 { color: #f43f5e; margin-top: 0; }
          p { color: #94a3b8; font-size: 14px; line-height: 1.5; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>Connection Failed</h2>
          <p>${result.error || "Failed to complete Google authorization."}</p>
          <p>Please return to LUMA and try again.</p>
        </div>
      </body>
      </html>
    `);
  }
});
