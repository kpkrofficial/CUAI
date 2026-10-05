"use client";

import { useState } from "react";
import { Edit2, Copy, Check } from "lucide-react";
import type { ChatMessage } from "@/lib/db/schema";
import AIResponseCard from "./AIResponseCard";
import type { ChatTheme } from "./ChatSettingsModal";

interface MessageItemProps {
  message: ChatMessage;
  onRegenerate?: () => void;
  onEdit?: (newContent: string) => void;
  onOptionClick?: (optionText: string) => void;
  isStreaming?: boolean;
  theme?: ChatTheme;
}

export default function MessageItem({
  message,
  onRegenerate,
  onEdit,
  onOptionClick,
  isStreaming = false,
  theme = "transparent",
}: MessageItemProps) {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.content);

  const isUser = message.role === "user";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveEdit = () => {
    if (editText.trim() && editText.trim() !== message.content) {
      onEdit?.(editText.trim());
    }
    setIsEditing(false);
  };

  let metadata: any = {};
  try {
    if (message.metadata_json) {
      metadata = typeof message.metadata_json === 'string' ? JSON.parse(message.metadata_json) : message.metadata_json;
    } else if ((message as any).tool_invocations) {
      const tools = (message as any).tool_invocations;
      metadata = {
        primaryTool: Array.isArray(tools) ? tools[0]?.tool : undefined,
        toolResults: tools,
      };
    }
  } catch (e) {}

  // Assistant Message Presentation
  if (!isUser) {
    return (
      <AIResponseCard
        content={message.content}
        messageId={message.id}
        onRegenerate={onRegenerate}
        onOptionClick={onOptionClick}
        metadata={metadata}
        isStreaming={isStreaming}
        theme={theme}
      />
    );
  }

  // User Message Presentation (Modern Apple-style right-aligned bubble)
  return (
    <div className="w-full max-w-[820px] mx-auto my-3 sm:my-4 flex flex-col items-end group">
      {isEditing ? (
        <div className="w-full max-w-xl bg-white border border-[#e5e5ea] rounded-2xl p-4 shadow-[0_4px_24px_rgba(0,0,0,0.06)] space-y-3">
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={3}
            className="w-full p-3 bg-[#f5f5f7] border border-[#e5e5ea] rounded-xl text-xs sm:text-sm text-[#0a0a0a] focus:bg-white focus:outline-none focus:border-[#0a0a0a] focus:ring-2 focus:ring-[#0a0a0a]/10 resize-none transition-all font-sans"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="h-8 px-3 rounded-xl bg-white hover:bg-[#f5f5f7] border border-[#e5e5ea] text-[#636366] text-xs font-semibold transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveEdit}
              className="h-8 px-3.5 rounded-xl bg-gradient-to-b from-[#1c1c1e] to-[#0a0a0a] hover:from-[#2c2c2e] hover:to-[#1c1c1e] text-white text-xs font-semibold shadow-[0_2px_6px_rgba(0,0,0,0.12)] transition-all cursor-pointer active:scale-95"
            >
              Save &amp; Submit
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-end gap-2 max-w-[88%] sm:max-w-[78%]">
          {/* Action buttons on hover */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity mb-1">
            <button
              type="button"
              onClick={handleCopy}
              className="p-1.5 rounded-lg hover:bg-[#f0f0f3] text-[#8a8a8e] hover:text-[#0a0a0a] transition-colors cursor-pointer"
              title="Copy prompt"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            {onEdit && (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="p-1.5 rounded-lg hover:bg-[#f0f0f3] text-[#8a8a8e] hover:text-[#0a0a0a] transition-colors cursor-pointer"
                title="Edit prompt"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Prompt Bubble */}
          <div className={`px-4 sm:px-5 py-2.5 sm:py-3 rounded-[20px] rounded-br-xs text-xs sm:text-[13.5px] leading-relaxed break-words font-sans transition-all ${
            {
              transparent: "bg-white/70 backdrop-blur-2xl border border-white/85 text-[#0a0a0a] shadow-[0_4px_20px_rgba(0,0,0,0.04)] font-medium",
              pure_light: "bg-gradient-to-b from-[#1c1c1e] to-[#0a0a0a] text-white shadow-[0_2px_8px_rgba(0,0,0,0.14)]",
              midnight_dark: "bg-[#27272a] text-white border border-white/10 shadow-[0_2px_8px_rgba(0,0,0,0.3)]",
              cool_blue: "bg-gradient-to-b from-[#0a66ff] to-[#0052cc] text-white shadow-[0_4px_16px_rgba(10,102,255,0.25)]",
              emerald: "bg-gradient-to-b from-[#059669] to-[#047857] text-white shadow-[0_4px_16px_rgba(5,150,105,0.25)]",
              sunset: "bg-gradient-to-b from-[#ea580c] to-[#c2410c] text-white shadow-[0_4px_16px_rgba(234,88,12,0.25)]",
            }[theme] || "bg-white/70 backdrop-blur-2xl border border-white/85 text-[#0a0a0a]"
          }`}>
            {message.content}
          </div>
        </div>
      )}
    </div>
  );
}
