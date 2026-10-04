"use client";

import { useState, useEffect } from "react";
import {
  Bot,
  ThumbsUp,
  ThumbsDown,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Search,
  Filter,
  ArrowRight,
  ShieldAlert,
  SlidersHorizontal,
  Code2,
  Copy,
  Check,
  Sparkles,
} from "lucide-react";
import AdminHeader from "@/components/admin/AdminHeader";

export default function AdminAILearningPage() {
  const [metrics, setMetrics] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [failureFilter, setFailureFilter] = useState("all");
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [regressionCandidate, setRegressionCandidate] = useState<any>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchLearningData();
  }, [statusFilter, failureFilter]);

  const fetchLearningData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (failureFilter !== "all") params.set("failure_type", failureFilter);
      if (search.trim()) params.set("search", search.trim());

      const res = await fetch(`/api/admin/ai-learning?${params.toString()}`);
      const data = await res.json();
      if (data.metrics) setMetrics(data.metrics);
      if (data.events) setEvents(data.events);
    } catch (err) {
      console.error("Failed to fetch learning data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleReview = async (messageId: string, decision: "VERIFIED" | "REJECTED" | "DUPLICATE" | "PROMOTED") => {
    setActionLoading(true);
    try {
      const res = await fetch("/api/admin/ai-learning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, decision }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.regressionCandidate) {
          setRegressionCandidate(data.regressionCandidate);
        }
        await fetchLearningData();
      }
    } catch (err) {
      console.error("Review action failed:", err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCopyRegression = () => {
    if (!regressionCandidate) return;
    navigator.clipboard.writeText(JSON.stringify(regressionCandidate, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const metricCards = [
    { label: "Total Feedback", val: (metrics?.positive_feedback || 0) + (metrics?.negative_feedback || 0), icon: Bot, color: "text-[#0a0a0a]" },
    { label: "Positive 👍", val: metrics?.positive_feedback || 0, icon: ThumbsUp, color: "text-emerald-600" },
    { label: "Negative 👎", val: metrics?.negative_feedback || 0, icon: ThumbsDown, color: "text-rose-600" },
    { label: "Corrections", val: metrics?.correction_count || 0, icon: Sparkles, color: "text-purple-600" },
    { label: "Normalization Fails", val: metrics?.normalization_failures || 0, icon: AlertTriangle, color: "text-amber-600" },
    { label: "Routing Fails", val: metrics?.routing_failures || 0, icon: SlidersHorizontal, color: "text-orange-600" },
    { label: "Retrieval Fails", val: metrics?.retrieval_failures || 0, icon: ShieldAlert, color: "text-blue-600" },
    { label: "RAG Fails", val: metrics?.rag_failures || 0, icon: Filter, color: "text-indigo-600" },
    { label: "Provider Fails", val: metrics?.provider_failures || 0, icon: AlertTriangle, color: "text-red-600" },
    { label: "Review Required", val: metrics?.unresolved_queries || 0, icon: AlertTriangle, color: "text-amber-700" },
    { label: "Verified", val: metrics?.verified_candidates || 0, icon: CheckCircle2, color: "text-emerald-700" },
    { label: "Promoted", val: metrics?.promoted_candidates || 0, icon: Sparkles, color: "text-blue-700" },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-[#f5f5f7]">
      <AdminHeader
        title="AI Learning & Continuous Improvement"
        subtitle="Durable Supabase learning stream, PII-redacted user feedback, and regression candidate harvesting"
      />

      <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-5 sm:py-6 space-y-6">
        {/* Metric Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {metricCards.map((m) => {
            const Icon = m.icon;
            return (
              <div
                key={m.label}
                className="p-3.5 bg-white rounded-2xl border border-[#e3e4e8] shadow-2xs flex flex-col justify-between"
              >
                <div className="flex items-center justify-between text-xs text-[#8a8a8e]">
                  <span>{m.label}</span>
                  <Icon className={`w-3.5 h-3.5 ${m.color}`} />
                </div>
                <div className={`text-xl font-bold mt-2 tracking-tight ${m.color}`}>
                  {m.val}
                </div>
              </div>
            );
          })}
        </div>

        {/* Filter Toolbar */}
        <div className="bg-white p-4 rounded-2xl border border-[#e3e4e8] shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex-1 flex items-center gap-2">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-[#8a8a8e] absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search redacted queries or corrections..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchLearningData()}
                className="w-full pl-9 pr-3 py-1.5 bg-[#f9f9fb] border border-[#e5e5ea] rounded-xl text-xs text-[#0a0a0a] focus:bg-white focus:outline-none focus:border-[#0a0a0a]"
              />
            </div>
            <button
              type="button"
              onClick={fetchLearningData}
              className="h-8 px-3 rounded-xl bg-[#0a0a0a] hover:bg-[#2c2c2e] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Search</span>
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-8 px-3 bg-[#f9f9fb] border border-[#e5e5ea] rounded-xl text-xs text-[#0a0a0a] focus:outline-none cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="NEW">NEW</option>
              <option value="REVIEW_REQUIRED">REVIEW_REQUIRED</option>
              <option value="VERIFIED">VERIFIED</option>
              <option value="REJECTED">REJECTED</option>
              <option value="PROMOTED">PROMOTED</option>
            </select>

            <select
              value={failureFilter}
              onChange={(e) => setFailureFilter(e.target.value)}
              className="h-8 px-3 bg-[#f9f9fb] border border-[#e5e5ea] rounded-xl text-xs text-[#0a0a0a] focus:outline-none cursor-pointer"
            >
              <option value="all">All Failure Types</option>
              <option value="NORMALIZATION_ERROR">NORMALIZATION_ERROR</option>
              <option value="TYPO_VARIANT">TYPO_VARIANT</option>
              <option value="INTENT_ERROR">INTENT_ERROR</option>
              <option value="TOOL_ROUTING_ERROR">TOOL_ROUTING_ERROR</option>
              <option value="DATABASE_RETRIEVAL_ERROR">DATABASE_RETRIEVAL_ERROR</option>
              <option value="RAG_RETRIEVAL_ERROR">RAG_RETRIEVAL_ERROR</option>
              <option value="HALLUCINATION">HALLUCINATION</option>
              <option value="PII_LEAK">PII_LEAK</option>
            </select>

            <button
              type="button"
              onClick={fetchLearningData}
              className="h-8 px-3 rounded-xl bg-white hover:bg-[#fafafc] border border-[#e3e4e8] text-xs font-semibold text-[#0a0a0a] flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#8a8a8e] ${loading ? "animate-spin" : ""}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Events Table */}
        <div className="bg-white rounded-2xl border border-[#e3e4e8] shadow-2xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#f0f0f3] flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#0a0a0a]">
              Learning Events Stream ({events.length})
            </h3>
            <span className="text-[11px] text-[#8a8a8e]">
              Student PII automatically sanitized before presentation
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#fafafc] border-b border-[#f0f0f3] text-[#8a8a8e] uppercase font-mono text-[10px]">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Redacted Query</th>
                  <th className="px-4 py-3">Normalized Canonical</th>
                  <th className="px-4 py-3">Intent &amp; Tool</th>
                  <th className="px-4 py-3">Provider</th>
                  <th className="px-4 py-3">Feedback</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f0f3]">
                {events.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-xs text-[#8a8a8e]">
                      {loading ? "Loading learning events from Supabase..." : "No learning events match the current filter."}
                    </td>
                  </tr>
                ) : (
                  events.map((ev) => {
                    const isNeg = ev.feedback_type === "negative";
                    const isPos = ev.feedback_type === "positive";

                    return (
                      <tr key={ev.id || ev.message_id} className="hover:bg-[#fafafc]/60 transition-colors">
                        <td className="px-4 py-3 text-[#8a8a8e] whitespace-nowrap font-mono text-[11px]">
                          {new Date(ev.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </td>
                        <td className="px-4 py-3 font-medium text-[#0a0a0a] max-w-[200px] truncate" title={ev.redacted_message}>
                          {ev.redacted_message}
                        </td>
                        <td className="px-4 py-3 text-[#3a3a3c] font-mono text-[11px] max-w-[200px] truncate" title={ev.normalized_message}>
                          {ev.normalized_message}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="font-semibold text-[#0a0a0a]">{ev.intent}</span>
                          <span className="text-[#8a8a8e] ml-1">({ev.tool})</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-[#636366]">
                          {ev.provider} <span className="text-[10px] text-[#8a8a8e]">({ev.model})</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {isPos && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              👍 Helpful
                            </span>
                          )}
                          {isNeg && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-rose-50 text-rose-700 border border-rose-200" title={ev.feedback_reason}>
                              👎 {ev.feedback_reason || "Reported"}
                            </span>
                          )}
                          {!isPos && !isNeg && <span className="text-[#8a8a8e]">—</span>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-md font-mono text-[10px] font-semibold uppercase ${
                              ev.review_status === "VERIFIED"
                                ? "bg-emerald-100 text-emerald-800"
                                : ev.review_status === "REVIEW_REQUIRED"
                                ? "bg-amber-100 text-amber-800"
                                : ev.review_status === "PROMOTED"
                                ? "bg-blue-100 text-blue-800"
                                : ev.review_status === "REJECTED"
                                ? "bg-rose-100 text-rose-800"
                                : "bg-gray-100 text-gray-800"
                            }`}
                          >
                            {ev.review_status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {ev.review_status !== "VERIFIED" && ev.review_status !== "PROMOTED" && (
                              <button
                                type="button"
                                onClick={() => handleReview(ev.message_id, "VERIFIED")}
                                disabled={actionLoading}
                                className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-[11px] font-semibold cursor-pointer active:scale-95"
                              >
                                Verify
                              </button>
                            )}
                            {ev.review_status === "VERIFIED" && (
                              <button
                                type="button"
                                onClick={() => handleReview(ev.message_id, "PROMOTED")}
                                disabled={actionLoading}
                                className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-[11px] font-semibold cursor-pointer active:scale-95"
                              >
                                Promote
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setSelectedEvent(ev)}
                              className="px-2 py-1 bg-[#f5f5f7] hover:bg-[#e5e5ea] text-[#1c1c1e] rounded-lg text-[11px] font-semibold cursor-pointer"
                            >
                              Details
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Regression Candidate Modal */}
        {regressionCandidate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in">
            <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-[#e5e5ea] p-5 space-y-4 text-left">
              <div className="flex items-center justify-between pb-3 border-b border-[#f0f0f3]">
                <div className="flex items-center gap-2 text-emerald-600">
                  <CheckCircle2 className="w-5 h-5" />
                  <h3 className="text-sm font-bold text-[#0a0a0a]">Verified &amp; Regression Candidate Harvested</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setRegressionCandidate(null)}
                  className="text-[#8a8a8e] hover:text-[#0a0a0a]"
                >
                  ✕
                </button>
              </div>

              <p className="text-xs text-[#636366]">
                This verified correction has been formatted as an immutable test candidate. It will be evaluated in the regression test suite before promoting into canonical evaluation sets.
              </p>

              <div className="bg-[#1c1c1e] text-white p-3.5 rounded-xl font-mono text-[11px] overflow-x-auto relative">
                <button
                  type="button"
                  onClick={handleCopyRegression}
                  className="absolute top-2.5 right-2.5 p-1 rounded-md bg-white/10 hover:bg-white/20 text-white text-[10px] flex items-center gap-1 cursor-pointer"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? "Copied" : "Copy JSON"}</span>
                </button>
                <pre>{JSON.stringify(regressionCandidate, null, 2)}</pre>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setRegressionCandidate(null)}
                  className="h-8 px-4 bg-[#0a0a0a] text-white text-xs font-semibold rounded-xl"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Event Detail Modal */}
        {selectedEvent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fade-in">
            <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-[#e5e5ea] p-5 space-y-4 text-left">
              <div className="flex items-center justify-between pb-3 border-b border-[#f0f0f3]">
                <h3 className="text-sm font-bold text-[#0a0a0a]">Learning Event Details</h3>
                <button
                  type="button"
                  onClick={() => setSelectedEvent(null)}
                  className="text-[#8a8a8e] hover:text-[#0a0a0a]"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <span className="font-semibold text-[#8a8a8e] block text-[10px] uppercase">Redacted Message</span>
                  <div className="mt-1 p-2.5 bg-[#f9f9fb] border border-[#e5e5ea] rounded-xl text-[#0a0a0a]">
                    {selectedEvent.redacted_message}
                  </div>
                </div>

                <div>
                  <span className="font-semibold text-[#8a8a8e] block text-[10px] uppercase">Normalized Canonical Query</span>
                  <div className="mt-1 p-2.5 bg-[#f9f9fb] border border-[#e5e5ea] rounded-xl text-[#0a0a0a] font-mono text-[11px]">
                    {selectedEvent.normalized_message}
                  </div>
                </div>

                {selectedEvent.user_correction && (
                  <div>
                    <span className="font-semibold text-[#8a8a8e] block text-[10px] uppercase">User Correction</span>
                    <div className="mt-1 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 font-medium">
                      "{selectedEvent.user_correction}"
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 bg-[#f9f9fb] border border-[#e5e5ea] rounded-xl">
                    <span className="text-[10px] text-[#8a8a8e] block">Intent</span>
                    <span className="font-semibold">{selectedEvent.intent}</span>
                  </div>
                  <div className="p-2.5 bg-[#f9f9fb] border border-[#e5e5ea] rounded-xl">
                    <span className="text-[10px] text-[#8a8a8e] block">Tool Dispatched</span>
                    <span className="font-semibold">{selectedEvent.tool}</span>
                  </div>
                  <div className="p-2.5 bg-[#f9f9fb] border border-[#e5e5ea] rounded-xl">
                    <span className="text-[10px] text-[#8a8a8e] block">Provider &amp; Model</span>
                    <span className="font-semibold">{selectedEvent.provider} ({selectedEvent.model})</span>
                  </div>
                  <div className="p-2.5 bg-[#f9f9fb] border border-[#e5e5ea] rounded-xl">
                    <span className="text-[10px] text-[#8a8a8e] block">Failure Classification</span>
                    <span className="font-semibold text-rose-600">{selectedEvent.failure_type || "None"}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#f0f0f3]">
                <button
                  type="button"
                  onClick={() => setSelectedEvent(null)}
                  className="h-8 px-3 text-xs font-semibold text-[#636366] hover:bg-[#f5f5f7] rounded-xl"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleReview(selectedEvent.message_id, "REJECTED");
                    setSelectedEvent(null);
                  }}
                  className="h-8 px-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold"
                >
                  Reject
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleReview(selectedEvent.message_id, "VERIFIED");
                    setSelectedEvent(null);
                  }}
                  className="h-8 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs"
                >
                  Verify Candidate
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
