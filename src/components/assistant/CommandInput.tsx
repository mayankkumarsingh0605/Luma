import React, { useState, useRef, useEffect } from "react";

interface CommandInputProps {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export const CommandInput: React.FC<CommandInputProps> = ({
  onSubmit,
  disabled = false,
  placeholder = "Tell LUMA what you want to do...",
}) => {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea based on content
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        160
      )}px`;
    }
  }, [text]);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;

    onSubmit(trimmed);
    setText("");

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isSubmitDisabled = !text.trim() || disabled;

  return (
    <div className="w-full">
      <div
        className={`relative flex flex-col rounded-2xl border bg-[#0e1118]/90 p-3.5 backdrop-blur-xl shadow-2xl transition-all duration-200 ${
          disabled
            ? "border-white/10 opacity-70 cursor-not-allowed"
            : "border-white/15 hover:border-white/25 focus-within:border-white/40 focus-within:ring-1 focus-within:ring-white/20"
        }`}
      >
        {/* Multiline command input */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={disabled ? "LUMA is processing..." : placeholder}
          rows={1}
          className="w-full resize-none bg-transparent px-2 py-1 text-sm leading-relaxed text-gray-100 placeholder:text-gray-500 focus:outline-none disabled:cursor-not-allowed custom-scrollbar max-h-40 min-h-[38px]"
        />

        {/* Footer controls inside input card */}
        <div className="mt-2.5 flex items-center justify-between border-t border-white/5 pt-2.5">
          {/* Left: Input shortcuts and voice placeholder */}
          <div className="flex items-center gap-2.5">
            {/* Future Voice Input Placeholder (Disabled / Honest) */}
            <div className="relative group">
              <button
                type="button"
                disabled
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/5 text-gray-500 cursor-not-allowed border border-white/5 transition hover:bg-white/5"
                title="Voice input coming in Phase 3"
                aria-label="Voice input placeholder (Disabled)"
              >
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
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                  />
                </svg>
              </button>
              {/* Tooltip */}
              <div className="pointer-events-none absolute bottom-full left-0 mb-1.5 hidden w-max rounded-lg bg-gray-900 px-2 py-1 text-[10px] text-gray-400 border border-white/10 shadow-lg group-hover:block">
                Voice Input (Coming in Phase 3)
              </div>
            </div>

            <span className="hidden sm:inline-flex text-[11px] text-gray-500 font-mono items-center gap-1.5">
              <span>Press</span>
              <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-gray-300 font-medium">↵ Enter</kbd>
              <span>to send,</span>
              <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-gray-300 font-medium">⇧ Shift + ↵</kbd>
              <span>new line</span>
            </span>
          </div>

          {/* Right: Submit Button */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitDisabled}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold tracking-wide transition-all duration-200 cursor-pointer shadow-md ${
              isSubmitDisabled
                ? "bg-white/10 text-gray-500 cursor-not-allowed"
                : "bg-white text-black hover:bg-gray-100 hover:shadow-lg active:scale-98"
            }`}
          >
            {disabled ? (
              <>
                <svg
                  className="h-3.5 w-3.5 animate-spin text-gray-400"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                  />
                </svg>
                <span>Processing...</span>
              </>
            ) : (
              <>
                <span>Send</span>
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2.5"
                    d="M14 5l7 7m0 0l-7 7m7-7H3"
                  />
                </svg>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
