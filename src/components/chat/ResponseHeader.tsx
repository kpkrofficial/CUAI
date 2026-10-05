"use client";

import { Sparkles, Bot, ShieldCheck } from "lucide-react";
import ResponseActions from "./ResponseActions";

interface ResponseHeaderProps {
  content: string;
  messageId?: string;
  onRegenerate?: () => void;
  isStreaming?: boolean;
  metadata?: any;
  tool?: string;
}

function resolveSourceBadge(content: string, metadata?: any, tool?: string) {
  const primaryTool =
    tool ||
    metadata?.primaryTool ||
    metadata?.tool ||
    metadata?.toolResults?.[0]?.tool ||
    metadata?.tool_invocations?.[0]?.tool;

  if (primaryTool === 'getStudentProfile') {
    return { label: 'Student Profile', dotColor: 'bg-blue-600', badgeBg: 'bg-blue-50 text-blue-700 border-blue-200' };
  }
  if (primaryTool === 'getAcademicRecord' || primaryTool === 'searchAcademicRecords') {
    return { label: 'Academic Record', dotColor: 'bg-emerald-600', badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  }
  if (primaryTool === 'getApplicationStatus') {
    return { label: 'Application Status', dotColor: 'bg-amber-600', badgeBg: 'bg-amber-50 text-amber-700 border-amber-200' };
  }
  if (primaryTool === 'getEligibilityData') {
    return { label: 'Eligibility', dotColor: 'bg-purple-600', badgeBg: 'bg-purple-50 text-purple-700 border-purple-200' };
  }
  if (primaryTool === 'countStudents' || primaryTool === 'searchStudents') {
    return { label: 'Analytics', dotColor: 'bg-indigo-600', badgeBg: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
  }
  if (primaryTool === 'searchKnowledge') {
    return { label: 'Grounded RAG', dotColor: 'bg-[#0a0a0a]', badgeBg: 'bg-[#f0f0f3] text-[#636366] border-[#e5e5ea]' };
  }

  // Fallback: Infer from content headers
  if (content.includes('Verified Student Information') || content.includes('Student Profile')) {
    return { label: 'Student Profile', dotColor: 'bg-blue-600', badgeBg: 'bg-blue-50 text-blue-700 border-blue-200' };
  }
  if (
    content.includes('Verified Academic Record') ||
    content.includes('Verified Student Academic Profile') ||
    content.includes('SSC Score') ||
    content.includes('Intermediate Percentage') ||
    content.includes('CGPA:')
  ) {
    return { label: 'Academic Record', dotColor: 'bg-emerald-600', badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  }
  if (content.includes('Verified Application Status')) {
    return { label: 'Application Status', dotColor: 'bg-amber-600', badgeBg: 'bg-amber-50 text-amber-700 border-amber-200' };
  }
  if (content.includes('Evaluation') && content.includes('Criteria Breakdown')) {
    return { label: 'Eligibility', dotColor: 'bg-purple-600', badgeBg: 'bg-purple-50 text-purple-700 border-purple-200' };
  }
  if (content.includes('Verified Institutional Query') || content.includes('Verified Student Count:')) {
    return { label: 'Analytics', dotColor: 'bg-indigo-600', badgeBg: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
  }
  if (
    content.includes('Verified Campus Policy Information') ||
    content.includes('Based on verified campus documentation') ||
    content.includes('Admissions Handbook')
  ) {
    return { label: 'Grounded RAG', dotColor: 'bg-[#0a0a0a]', badgeBg: 'bg-[#f0f0f3] text-[#636366] border-[#e5e5ea]' };
  }

  return { label: 'Campus AI', dotColor: 'bg-[#0a0a0a]', badgeBg: 'bg-[#f0f0f3] text-[#636366] border-[#e5e5ea]' };
}

export default function ResponseHeader({
  content,
  messageId,
  onRegenerate,
  isStreaming = false,
  metadata,
  tool,
}: ResponseHeaderProps) {
  const badge = resolveSourceBadge(content, metadata, tool);

  return (
    <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-[#e5e5ea]/80 select-none">
      {/* Left: AI Avatar & Model Details */}
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-xl bg-white/70 backdrop-blur-md border border-white/80 text-[#0a0a0a] flex items-center justify-center p-0.5 shadow-xs flex-shrink-0">
          <img
            src="/logo.png"
            alt="AI"
            className="w-full h-full object-cover rounded-lg"
            onError={(e) => {
              (e.target as HTMLElement).style.display = "none";
            }}
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs sm:text-[13px] font-bold text-[#0a0a0a] tracking-tight">
            CityApp AI
          </span>
          <span className={`hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${badge.badgeBg}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${badge.dotColor}`} />
            {badge.label}
          </span>
        </div>
      </div>

      {/* Right: Minimal Actions Toolbar */}
      <ResponseActions
        content={content}
        messageId={messageId || metadata?.messageId}
        onRegenerate={onRegenerate}
        isStreaming={isStreaming}
      />
    </div>
  );
}
