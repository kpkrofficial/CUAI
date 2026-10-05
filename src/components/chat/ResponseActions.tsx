"use client";

import { useState } from "react";
import { Copy, Check, RotateCcw, ThumbsUp, ThumbsDown, X, MessageSquare, AlertCircle } from "lucide-react";

interface ResponseActionsProps {
  content: string;
  messageId?: string;
  onRegenerate?: () => void;
  isStreaming?: boolean;
}

const NEGATIVE_REASONS = [
  "Wrong information",
  "Wrong interpretation",
  "Wrong data",
  "Wrong student",
  "Could not find my information",
  "Wrong source",
  "Other",
];

export default function ResponseActions({
  content,
  messageId,
  onRegenerate,
  isStreaming = false,
}: ResponseActionsProps) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<"positive" | "negative" | null>(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [selectedReason, setSelectedReason] = useState<string>("Wrong information");
  const [userCorrection, setUserCorrection] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedMessage, setSubmittedMessage] = useState<string | null>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  const handlePositiveFeedback = async () => {
    if (feedback === "positive") return;
    setFeedback("positive");
    setSubmittedMessage("Thank you for your feedback!");
    setTimeout(() => setSubmittedMessage(null), 3000);

    if (messageId) {
      try {
        await fetch("/api/chat/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messageId,
            type: "positive",
          }),
        });
      } catch (err) {
        console.error("Failed to submit positive feedback:", err);
      }
    }
  };

  const handleNegativeClick = () => {
    setShowFeedbackModal(true);
  };

  const handleSubmitNegative = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (messageId) {
        await fetch("/api/chat/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messageId,
            type: "negative",
            reason: selectedReason,
            userCorrection: userCorrection.trim() || undefined,
          }),
        });
      }
      setFeedback("negative");
      setShowFeedbackModal(false);
      setSubmittedMessage("Feedback flagged for review. Thank you!");
      setTimeout(() => setSubmittedMessage(null), 4000);
    } catch (err) {
      console.error("Failed to submit negative feedback:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative flex items-center gap-1 text-[#8a8a8e]">
      {submittedMessage && (
        <span className="hidden sm:inline-block text-[11px] font-medium text-emerald-600 animate-fade-in mr-1">
          {submittedMessage}
        </span>
      )}

      {/* Copy Button */}
      <button
        type="button"
        onClick={handleCopy}
        className="h-7 px-2 rounded-lg bg-transparent hover:bg-[#f0f0f3] text-[#8a8a8e] hover:text-[#0a0a0a] transition-all flex items-center gap-1.5 text-[11px] font-medium active:scale-95 cursor-pointer"
        title="Copy response"
        id={`copy-btn-${messageId || 'default'}`}
      >
        {copied ? (
          <>
            <Check className="w-3.5 h-3.5 text-emerald-600" />
            <span className="text-emerald-600 font-semibold text-[10.5px]">Copied</span>
          </>
        ) : (
          <>
            <Copy className="w-3.5 h-3.5" />
            <span className="hidden sm:inline text-[10.5px]">Copy</span>
          </>
        )}
      </button>

      {/* Thumbs Up Button */}
      <button
        type="button"
        onClick={handlePositiveFeedback}
        disabled={isStreaming}
        className={`h-7 px-2 rounded-lg transition-all flex items-center gap-1 text-[11px] font-medium active:scale-95 cursor-pointer ${
          feedback === "positive"
            ? "bg-emerald-50 text-emerald-700 font-semibold"
            : "bg-transparent hover:bg-[#f0f0f3] text-[#8a8a8e] hover:text-[#0a0a0a]"
        }`}
        title="Helpful response"
        id={`thumbs-up-${messageId || 'default'}`}
      >
        <ThumbsUp className={`w-3.5 h-3.5 ${feedback === "positive" ? "fill-emerald-600 text-emerald-600" : ""}`} />
      </button>

      {/* Thumbs Down Button */}
      <button
        type="button"
        onClick={handleNegativeClick}
        disabled={isStreaming}
        className={`h-7 px-2 rounded-lg transition-all flex items-center gap-1 text-[11px] font-medium active:scale-95 cursor-pointer ${
          feedback === "negative"
            ? "bg-rose-50 text-rose-700 font-semibold"
            : "bg-transparent hover:bg-[#f0f0f3] text-[#8a8a8e] hover:text-[#0a0a0a]"
        }`}
        title="Report issue or incorrect response"
        id={`thumbs-down-${messageId || 'default'}`}
      >
        <ThumbsDown className={`w-3.5 h-3.5 ${feedback === "negative" ? "fill-rose-600 text-rose-600" : ""}`} />
      </button>

      {/* Regenerate Button */}
      {onRegenerate && !isStreaming && (
        <button
          type="button"
          onClick={onRegenerate}
          className="w-7 h-7 rounded-lg bg-transparent hover:bg-[#f0f0f3] text-[#8a8a8e] hover:text-[#0a0a0a] transition-all flex items-center justify-center active:scale-95 cursor-pointer"
          title="Regenerate response"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Negative Feedback Modal */}
      {showFeedbackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in">
          <div
            className="w-full max-w-md bg-white rounded-2xl shadow-[0_12px_48px_rgba(0,0,0,0.18)] border border-[#e5e5ea] overflow-hidden text-left"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-[#f0f0f3] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <h3 className="text-sm font-bold text-[#0a0a0a]">Provide Feedback</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowFeedbackModal(false)}
                className="w-7 h-7 rounded-lg hover:bg-[#f5f5f7] flex items-center justify-center text-[#8a8a8e] hover:text-[#0a0a0a] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmitNegative} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#1c1c1e] mb-2">
                  What went wrong with this response?
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {NEGATIVE_REASONS.map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => setSelectedReason(reason)}
                      className={`text-left text-xs px-3 py-2 rounded-xl border transition-all ${
                        selectedReason === reason
                          ? "bg-[#0a0a0a] text-white border-[#0a0a0a] font-medium shadow-xs"
                          : "bg-[#f9f9fb] text-[#3a3a3c] border-[#e5e5ea] hover:bg-[#f0f0f3]"
                      }`}
                    >
                      {reason}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1c1c1e] mb-1.5 flex items-center justify-between">
                  <span>Optional Correction</span>
                  <span className="text-[11px] font-normal text-[#8a8a8e]">No personal info needed</span>
                </label>
                <textarea
                  value={userCorrection}
                  onChange={(e) => setUserCorrection(e.target.value)}
                  placeholder="e.g. I asked for marks, not my roll number."
                  rows={2}
                  className="w-full p-2.5 bg-[#f9f9fb] border border-[#e5e5ea] rounded-xl text-xs text-[#0a0a0a] focus:bg-white focus:outline-none focus:border-[#0a0a0a] focus:ring-1 focus:ring-[#0a0a0a] resize-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-[#f0f0f3]">
                <button
                  type="button"
                  onClick={() => setShowFeedbackModal(false)}
                  className="h-8 px-3 rounded-xl bg-transparent hover:bg-[#f5f5f7] text-[#636366] text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-8 px-4 rounded-xl bg-[#0a0a0a] hover:bg-[#2c2c2e] text-white text-xs font-semibold shadow-xs active:scale-95 transition-all disabled:opacity-50"
                >
                  {isSubmitting ? "Submitting..." : "Submit Feedback"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
