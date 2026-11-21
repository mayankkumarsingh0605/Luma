import React, { useState } from "react";
import type { ScreenshotData } from "../../types/computer.js";

interface ScreenPreviewProps {
  screenshot: ScreenshotData | null;
  isLoading: boolean;
  onRefresh: () => void;
}

export const ScreenPreview: React.FC<ScreenPreviewProps> = ({
  screenshot,
  isLoading,
  onRefresh,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0e1118]/80 p-5 backdrop-blur-md shadow-xl flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white shadow-inner">
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white tracking-wide">
              SCREEN MONITOR
            </h3>
            <p className="text-xs text-gray-400">
              Live visual viewport of the primary desktop display
            </p>
          </div>
        </div>

        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-semibold text-black transition hover:bg-gray-200 disabled:opacity-50 shadow-md cursor-pointer"
        >
          <svg
            className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          <span>{isLoading ? "Capturing..." : "Refresh Screen"}</span>
        </button>
      </div>

      {/* Screen Frame */}
      <div className="mt-4 flex-1 flex flex-col justify-center">
        {screenshot ? (
          <div className="group relative overflow-hidden rounded-xl border border-white/10 bg-black/60 shadow-2xl transition hover:border-white/20">
            <img
              src={screenshot.dataUrl}
              alt="Desktop Screen Capture"
              onClick={() => setIsModalOpen(true)}
              className="w-full h-auto max-h-[360px] object-contain rounded-lg cursor-zoom-in transition group-hover:scale-[1.01]"
            />

            {/* Hover overlay hint */}
            <div
              onClick={() => setIsModalOpen(true)}
              className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 backdrop-blur-[2px] transition group-hover:opacity-100 cursor-zoom-in"
            >
              <div className="rounded-xl border border-white/20 bg-black/80 px-4 py-2 text-xs font-medium text-white shadow-xl flex items-center gap-2">
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7"
                  />
                </svg>
                Click to Enlarge Fullscreen
              </div>
            </div>

            {/* Footer telemetry */}
            <div className="flex items-center justify-between border-t border-white/10 bg-black/80 px-3 py-2 text-[11px] font-mono text-gray-400">
              <span>
                {screenshot.width} × {screenshot.height} px
              </span>
              <span>{(screenshot.byteSize / 1024).toFixed(1)} KB</span>
              <span>{new Date(screenshot.timestamp).toLocaleTimeString()}</span>
            </div>
          </div>
        ) : (
          <div className="flex h-56 flex-col items-center justify-center rounded-xl border border-dashed border-white/15 bg-black/30 p-6 text-center">
            {isLoading ? (
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
                <p className="text-sm font-medium text-gray-300">
                  Capturing primary display...
                </p>
              </div>
            ) : (
              <>
                <svg
                  className="h-10 w-10 text-gray-500 mb-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.5"
                    d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                <p className="text-sm font-medium text-gray-400">
                  No screen capture yet
                </p>
                <p className="text-xs text-gray-500 mt-1 max-w-xs">
                  Click "Refresh Screen" above to take an instant snapshot of your desktop.
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Fullscreen Modal Lightbox */}
      {isModalOpen && screenshot && (
        <div
          onClick={() => setIsModalOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md cursor-zoom-out"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[90vh] max-w-[95vw] overflow-hidden rounded-2xl border border-white/20 bg-[#0e1118] shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3 bg-[#111319]">
              <div className="flex items-center gap-3 text-xs font-mono text-gray-300">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Desktop Display ({screenshot.width} × {screenshot.height})
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg bg-white/10 px-3 py-1 text-xs text-gray-300 hover:bg-white/20"
              >
                Close (Esc)
              </button>
            </div>
            <div className="p-2 bg-black">
              <img
                src={screenshot.dataUrl}
                alt="Full screen preview"
                className="max-h-[80vh] w-auto object-contain mx-auto rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
