"use client";

import { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ResponseHeader from "./ResponseHeader";
import SectionHeader from "./SectionHeader";
import InformationGrid from "./InformationGrid";
import InformationField from "./InformationField";
import CodeBlock from "./CodeBlock";
import ResponsiveTable from "./ResponsiveTable";
import type { ChatTheme } from "./ChatSettingsModal";

interface AIResponseCardProps {
  content: string;
  messageId?: string;
  onRegenerate?: () => void;
  onOptionClick?: (optionText: string) => void;
  metadata?: any;
  isStreaming?: boolean;
  theme?: ChatTheme;
}

// Helper to extract Key: Value pairs from markdown list items
function extractKeyValue(children: any): { label: string; value: any } | null {
  if (!children) return null;

  if (Array.isArray(children)) {
    const first = children[0];
    // Check if first element is <strong>Label</strong>
    if (first && typeof first === "object" && first.type === "strong") {
      const label = first.props?.children ? String(first.props.children).replace(/:$/, "").trim() : "";
      const rest = children.slice(1);
      const cleanValue = rest.map((item, idx) => {
        if (idx === 0 && typeof item === "string") {
          return item.replace(/^[:\s–—-]+/, "").trim();
        }
        return item;
      });
      if (label) {
        return { label, value: cleanValue };
      }
    }

    // Check if first item is string containing colon e.g. "Name: Aditya"
    if (typeof first === "string" && first.includes(":")) {
      const parts = first.split(":");
      const label = parts[0].trim();
      const valStr = parts.slice(1).join(":").trim();
      if (label.length > 0 && label.length < 40) {
        return { label, value: [valStr, ...children.slice(1)] };
      }
    }
  }

  if (typeof children === "string" && children.includes(":")) {
    const parts = children.split(":");
    const label = parts[0].trim();
    const value = parts.slice(1).join(":").trim();
    if (label.length > 0 && label.length < 40) {
      return { label, value };
    }
  }

  return null;
}

// Helper to clean redundant introductory sentences and blockquotes from content
function sanitizeContent(raw: string): string {
  if (!raw) return "";
  let cleaned = raw;
  // Remove intro lines like "**Aditya Varma** is a 1st Year Computer Science & Engineering (AI & ML) student at City University Campus, Hyderabad."
  cleaned = cleaned.replace(/^\s*\*\*[^*]+\*\*\s+is\s+a?[^.\n]+(?:\.|\n+)\s*/i, "");
  cleaned = cleaned.replace(/^\s*\*\*[^*]+\*\*\s+is\s+\d+(?:st|nd|rd|th)?[^.\n]+(?:\.|\n+)\s*/i, "");
  // Remove blockquotes like "> First year AI & ML undergraduate..."
  cleaned = cleaned.replace(/\n*>\s*.*$/i, "");
  return cleaned.trim();
}

export default function AIResponseCard({
  content,
  messageId,
  onRegenerate,
  onOptionClick,
  metadata,
  isStreaming = false,
  theme = "transparent",
}: AIResponseCardProps) {
  // Dynamic theme card class
  const cardThemeStyles = {
    transparent: "bg-white/55 backdrop-blur-2xl border-white/80 shadow-[0_8px_32px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.7)] text-[#1c1c1e]",
    pure_light: "bg-white border-[#e5e5ea] shadow-[0_4px_24px_rgba(0,0,0,0.04)] text-[#1c1c1e]",
    midnight_dark: "bg-[#141518]/95 backdrop-blur-2xl border-white/10 text-[#f2f2f7] shadow-[0_8px_32px_rgba(0,0,0,0.4)]",
    cool_blue: "bg-white/70 backdrop-blur-2xl border-blue-200/50 shadow-[0_8px_32px_rgba(10,102,255,0.05)] text-[#1c1c1e]",
    emerald: "bg-white/70 backdrop-blur-2xl border-emerald-200/50 shadow-[0_8px_32px_rgba(16,185,129,0.05)] text-[#1c1c1e]",
    sunset: "bg-white/70 backdrop-blur-2xl border-orange-200/50 shadow-[0_8px_32px_rgba(249,115,22,0.05)] text-[#1c1c1e]",
  }[theme] || "bg-white/55 backdrop-blur-2xl border-white/80 shadow-[0_8px_32px_rgba(0,0,0,0.04)] text-[#1c1c1e]";

  const isDark = theme === "midnight_dark";

  // Check if single student matched with profile image
  const singleStudent = metadata?.matchedStudents && metadata.matchedStudents.length === 1 ? metadata.matchedStudents[0] : null;
  const studentPhoto = singleStudent?.profile_image;
  const displayContent = sanitizeContent(content);

  return (
    <div className={`w-full max-w-[820px] mx-auto my-3 sm:my-4 p-5 sm:p-7 md:p-8 rounded-[22px] sm:rounded-[26px] border transition-all relative overflow-hidden group ${cardThemeStyles}`}>
      {/* Top subtle glossy sheen line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent pointer-events-none" />

      {/* Response Header */}
      <ResponseHeader
        content={content}
        messageId={messageId || metadata?.messageId}
        metadata={metadata}
        onRegenerate={onRegenerate}
        isStreaming={isStreaming}
      />

      {/* 🖼️ Student Profile Image Holder (Displayed above details) */}
      {studentPhoto && (
        <div className={`my-4 p-4 sm:p-5 rounded-2xl border backdrop-blur-md shadow-xs flex flex-row items-center gap-4 sm:gap-5 animate-fade-in ${
          isDark 
            ? "bg-white/5 border-white/10 text-white" 
            : "bg-white/75 border-[#e3e4e8] text-[#0a0a0a]"
        }`}>
          <div className={`w-20 h-20 sm:w-24 sm:h-24 md:w-26 md:h-26 rounded-2xl overflow-hidden border shrink-0 relative ${
            isDark ? "border-white/10 bg-white/5" : "border-[#e3e4e8] bg-[#f5f5f7] shadow-xs"
          }`}>
            <img
              src={studentPhoto}
              alt={singleStudent.name}
              className="w-full h-full object-cover object-top"
            />
            <div className="absolute inset-0 ring-1 ring-inset ring-black/5 rounded-2xl pointer-events-none" />
          </div>
          <div className="flex-1 min-w-0 text-left space-y-1.5">
            <div className="flex items-center justify-start gap-2 flex-wrap">
              <h3 className={`text-base sm:text-lg font-bold tracking-tight ${isDark ? "text-white" : "text-[#0a0a0a]"}`}>
                {singleStudent.name}
              </h3>
              <span className={`font-mono text-xs font-semibold px-2 py-0.5 rounded-md border ${
                isDark ? "bg-white/10 border-white/10 text-white" : "bg-[#f5f5f7] text-[#0a0a0a] border-[#e3e4e8]"
              }`}>
                {singleStudent.roll_number}
              </span>
            </div>
            <div className={`text-xs font-medium ${isDark ? "text-white/60" : "text-[#8a8a8e]"}`}>
              {singleStudent.branch} {singleStudent.year ? `• ${singleStudent.year.replace("_", " ").toUpperCase()}` : ""}
            </div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#0a66ff]/[0.10] text-[#0a66ff] border border-[#0a66ff]/20 text-[11px] font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0a66ff] animate-pulse" />
              Verified Student Profile
            </div>
          </div>
        </div>
      )}

      {/* Main Response Content */}
      <div className="text-xs sm:text-[13.5px] text-[#1c1c1e] leading-[1.65] space-y-2.5">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // Section Headers
            h1({ children }) {
              return <SectionHeader title={String(children)} />;
            },
            h2({ children }) {
              return <SectionHeader title={String(children)} />;
            },
            h3({ children }) {
              return <SectionHeader title={String(children)} />;
            },
            h4({ children }) {
              return <SectionHeader title={String(children)} />;
            },

            // Lists & Key-Value Grids
            ul({ children }) {
              return <div className="my-2 space-y-1.5">{children}</div>;
            },
            li({ children }) {
              const kv = extractKeyValue(children);
              if (kv) {
                return (
                  <div className="my-1.5">
                    <InformationField label={kv.label} value={kv.value} />
                  </div>
                );
              }
              return (
                <div className="flex items-start gap-2.5 text-xs sm:text-[13.5px] text-[#2c2c2e] my-1.5 leading-relaxed">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0a0a0a] mt-2 flex-shrink-0" />
                  <div className="flex-1 min-w-0">{children}</div>
                </div>
              );
            },
            ol({ children }) {
              return <ol className="list-decimal list-inside space-y-1.5 my-2 text-xs sm:text-[13.5px] text-[#2c2c2e]">{children}</ol>;
            },

            // Paragraphs
            p({ children }) {
              return <p className="my-2 leading-relaxed text-[#1c1c1e] font-sans">{children}</p>;
            },

            // Bold text
            strong({ children }) {
              return <strong className="font-bold text-[#0a0a0a]">{children}</strong>;
            },

            // Inline and Block Code
            code({ node, inline, className, children, ...props }: any) {
              const match = /language-(\w+)/.exec(className || "");
              const codeStr = String(children).replace(/\n$/, "");
              const isMultiLine = codeStr.includes("\n");

              // Only render multi-line real code blocks with explicit language as code block
              if (!inline && isMultiLine && match) {
                return <CodeBlock language={match[1]} code={codeStr} />;
              }

              // Everything else (single line, roll numbers, identifiers) renders as a clean inline badge
              return (
                <code
                  className="px-1.5 py-0.5 rounded-md bg-[#f5f5f7] text-[#0a0a0a] border border-[#e3e4e8] text-[11.5px] font-mono font-semibold inline-block my-0.5"
                  {...props}
                >
                  {children}
                </code>
              );
            },
            pre({ children }: any) {
              return <div className="my-1">{children}</div>;
            },

            // Tables
            table({ children }) {
              return <ResponsiveTable>{children}</ResponsiveTable>;
            },
            thead({ children }) {
              return <thead className="bg-[#fafafc] text-[#8a8a8e] font-semibold border-b border-[#e5e5ea] uppercase tracking-wider text-[10.5px]">{children}</thead>;
            },
            tbody({ children }) {
              return <tbody className="divide-y divide-[#f2f2f7] font-medium text-[#0a0a0a]">{children}</tbody>;
            },
            tr({ children }) {
              return <tr className="hover:bg-[#fafafc] transition-colors">{children}</tr>;
            },
            th({ children }) {
              return <th className="py-2.5 px-3 sm:px-4">{children}</th>;
            },
            td({ children }) {
              return <td className="py-2.5 px-3 sm:px-4">{children}</td>;
            },

            // Blockquote
            blockquote({ children }) {
              return (
                <blockquote className="my-3 pl-3.5 border-l-2 border-[#0a0a0a] bg-[#f8f8fa] p-3 rounded-r-xl text-xs sm:text-[13px] text-[#636366] italic">
                  {children}
                </blockquote>
              );
            },

            // Links
            a({ href, children }) {
              return (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#0a0a0a] underline font-semibold decoration-[#8a8a8e] hover:decoration-[#0a0a0a] transition-all"
                >
                  {children}
                </a>
              );
            },
          }}
        >
          {displayContent}
        </ReactMarkdown>

        {/* Disambiguation Option Pills */}
        {metadata?.isDisambiguation && metadata?.matchedStudents && onOptionClick && (
          <div className="mt-4 pt-4 border-t border-[#e5e5ea]/80">
            <span className="text-xs font-semibold text-[#8a8a8e] block mb-2.5 uppercase tracking-wider">
              Select matching student record:
            </span>
            <div className="flex flex-wrap gap-2">
              {metadata.matchedStudents.map((std: any) => (
                <button
                  key={std.id}
                  type="button"
                  onClick={() => onOptionClick(std.roll_number || std.name)}
                  className="px-3.5 py-2 rounded-xl bg-white hover:bg-[#fafafc] border border-[#e5e5ea] hover:border-[#0a0a0a] text-xs text-[#0a0a0a] transition-all font-semibold flex items-center gap-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)] active:scale-[0.98] cursor-pointer group"
                >
                  <span>{std.name}</span>
                  <span className="text-[11px] text-[#8a8a8e] font-mono group-hover:text-[#0a0a0a]">
                    ({std.roll_number})
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Streaming Cursor */}
        {isStreaming && (
          <span className="inline-block w-2 h-4 ml-1 bg-[#0a0a0a] animate-pulse align-middle rounded-xs" />
        )}
      </div>
    </div>
  );
}
