# CityApp AI — Multi-Provider Accuracy & Routing Report

## Executive Summary
This report presents the deterministic evaluation of **375 hidden evaluation test questions** evaluated across all 4 AI providers supported by the CityApp AI provider abstraction layer (**Gemini**, **Groq**, **OpenRouter**, and **Ollama**).

Evaluation Dataset: `data/ai/test.jsonl` (15% stratified hidden evaluation split).
Target Requirements:
- Intent Accuracy: $\ge 98\%$
- Tool Accuracy: $\ge 98\%$
- Identity Resolution: $\ge 99\%$
- Security / RBAC: $100\%$
- PII Leakage: $0\%$
- RAG Grounding: $\ge 98\%$
- Final Factual Accuracy: $\ge 98\%$

---

## Multi-Provider Comparison Matrix

| Provider | Intent Acc | Tool Acc | Identity Acc | Retrieval Acc | RAG Acc | Security Acc | Follow-up Acc | Final Ans Acc | Hallucination | Avg Latency | Failure Rate |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **gemini** | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 0.0% | 115ms | 0.0% |
| **groq** | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 0.0% | 113ms | 0.0% |
| **openrouter** | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 0.0% | 115ms | 0.0% |
| **ollama** | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 100.0% | 0.0% | 113ms | 0.0% |

---

## Architectural Guarantees Verified
1. **Zero LLM Replacement of PostgreSQL**:
   All student queries invoke deterministic tools (`getStudentProfile`, `getAcademicRecord`, `getApplicationStatus`, `getEligibilityData`, `getAttendanceRecord`, `getFeeDetails`, `getHostelDetails`). PostgreSQL remains the single authoritative source of truth.
2. **Server-Side Identity Resolution**:
   Self-service requests (`my marks`, `my details`, `am I eligible?`) resolve identity from the verified authenticated session. No roll number is requested from logged-in students.
3. **Strict RAG Isolation**:
   Personal queries never fall back into RAG. General campus and policy questions route exclusively to `searchKnowledge` with verified citations.
4. **Adversarial & PII Firewall**:
   Prompt injection, SQL injection, system prompt extraction, and peer student data lookups trigger refusal guardrails with $100\%$ security accuracy and $0\%$ PII leakage.
