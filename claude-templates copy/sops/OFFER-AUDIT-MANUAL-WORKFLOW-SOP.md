# Offer Audit – Manual Workflow & Analysis SOP

This SOP captures the **current / idealized manual process** for running an offer audit so we can mirror and automate it end‑to‑end in the new platform.

It is based on your written description, existing docs in `docs/`, and the analysis prompt in `examples/custom-prompt-example.txt`.

---

## 1. High‑Level Outcome

**Goal:** Given 10 closed and 10 didn’t‑close sales calls plus client context (Typeform, assets), identify:

- The **core disconnect** between how the offer is sold/positioned and how buyers actually perceive/value it.
- The **language patterns** that correlate with wins vs losses.
- Concrete **changes to offer architecture, messaging, and sales process** that increase close rate and quality of clients.

The new platform will reproduce this outcome automatically; this doc describes how you do it manually today.

---

## 2. Manual Workflow – End to End

### 2.1 Purchase & Onboarding

1. **Client purchases** the offer audit.
2. They are redirected into your onboarding environment (currently WAP community / equivalent):
   - Page 1: “Next steps” / expectations.
   - Page 2: **Typeform intake**.
   - Page 3: **Call booking** (for live review).
3. **Typeform submission** includes (see `docs/TYPEFORM-IMPROVEMENTS.md`):
   - Basic info: name, email, company, offer name.
   - **Main objective**: “#1 obstacle/goal” they want solved.
   - Current metrics: close rate, deal size, calls/week, revenue (optional).
   - Sales process details & objections.
   - Offer/delivery model details.
   - Previous attempts and timeline/urgency.
   - **Call recording links** (ideally 10 closed + 10 didn’t‑close, standardized on Fathom links).
   - Links to key assets: website, LPs, ads, sales page, docs, etc.

4. **Automations (currently via Zapier / n8n):**
   - Create/update a **Notion** client record.
   - Create a **Google Drive** folder for the client.
   - Store Typeform responses in a Google Doc inside that folder.

### 2.2 Call Transcripts & Assets (Pre‑Automation vs Now)

Historically:

1. Client shared raw call recordings (Zoom, Fathom, etc.).
2. You manually:
   - Opened each recording in the note‑taker tool.
   - Copied the **full transcript**.
   - Pasted each transcript into NotebookLM / docs.

With the current Node/Fathom tooling (`src/` + `docs/QUICKSTART.md` / `README.md`):

1. You standardize on **Fathom (preferred)** and sometimes tl;dv / Read.ai.
2. You either:
   - Copy all Fathom URLs from the Typeform/Google Doc into `fathom-urls.txt`, or
   - Feed them directly via CLI / web UI / webhook.
3. Run the transcript exporter:
   - CLI: `npm start analyze -- --input fathom-urls.txt`.
   - Or via web UI / `/api/analyze` / `/api/webhook` in `src/server.js`.
4. The exporter:
   - Fetches transcripts (Fathom API + scraping, tl;dv, Read.ai).
   - Splits into **closed** and **didn’t close** calls (by ordering or categorization).
   - Writes `.txt` files into `output/**/closed/` and `output/**/didnt-close/`.
5. You then **upload these `.txt` files as sources into NotebookLM** (or equivalent) as a single “notebook” for that client.

### 2.3 Manual Analysis Workflow (NotebookLM‑style)

Once transcripts and assets are in NotebookLM (or another RAG‑style tool), you:

1. Create a **new notebook** for the client.
2. Upload as sources:
   - The 10 closed call transcripts.
   - The 10 didn’t‑close call transcripts.
   - Typeform answers / intake doc.
   - Website, sales page, ads, landing pages (as docs or scraped text).
   - Optional: existing offer docs, decks, Loom transcripts.
3. Run your **core analysis prompt** (see next section) against this notebook.
4. Iterate with a few follow‑up prompts as needed:
   - Clarify the core issue.
   - Drill into specific objections or segments.
   - Pull more concrete phrasing/quotes.
5. Capture outputs into:
   - A working Google Doc / Notion page that becomes the **offer audit report**.
   - Your Loom script / talking points for the live or recorded walkthrough.

---

## 3. Current Analysis Prompt (Offer Audit)

From `examples/custom-prompt-example.txt`:

```text
You are analyzing sales call transcripts for an offer audit.

Your goal: Identify the REAL reason prospects aren't buying (not the surface-level objection).

Analyze these transcripts and provide:

1. **THE CORE ISSUE**
   - What's the actual disconnect? (Usually NOT what the client thinks it is)
   - What fundamental belief or concern is driving the objections?
   - What's the "frame" battle happening on these calls?

2. **WHAT CLOSED CALLS DID DIFFERENTLY**
   - Specific phrases/positioning that worked
   - How did they overcome the core objection?
   - What created the buying decision?

3. **WHERE DIDN'T-CLOSE CALLS LOST IT**
   - Exact moment the sale was lost
   - What objection was actually masking the real concern?
   - What was the prospect REALLY worried about?

4. **THE FIX**
   - One big strategic change to the offer/positioning
   - 3 tactical quick wins for the sales process
   - What to say differently (exact phrases)

5. **OFFER ARCHITECTURE CHANGES**
   - Should the offer structure change? (price, deliverables, guarantee, etc.)
   - What objections can be eliminated by design?
   - What's missing that would make this a "no-brainer"?

Be direct. Quote actual call moments. Focus on root cause, not symptoms.
```

In practice you also:

- Ask follow‑ups like:
  - “Show me 10 concrete quotes from closed calls that encapsulate why they bought.”
  - “Show me 10 quotes from didn’t‑close calls that show why they hesitated.”
  - “Compare the language in closed vs didn’t‑close calls about risk, time, and trust.”
- Use those to refine:
  - The **diagnosis** of the offer/sales problem.
  - The **recommendations** and suggested phrasing changes.

---

## 4. Expected Outputs of an Offer Audit

Manually, a “good” audit typically produces:

1. **Core Diagnosis (1–2 pages)**
   - Clear articulation of the **real problem** in the sales/offer.
   - How this differs from what the client thought the problem was.
2. **Patterns from Closed Calls**
   - Language, frames, proof, and risk‑reversals that consistently led to buying.
   - Buyer mental models and “aha” moments.
3. **Patterns from Didn’t‑Close Calls**
   - The real reasons deals stalled or died.
   - Objections, hidden fears, and decision‑making patterns.
4. **Offer & Messaging Recommendations**
   - One big strategic shift.
   - A handful of tactical tweaks (headline, social proof, proof points, pricing/packaging, guarantees, etc.).
   - Concrete phrasing suggestions backed by quotes from the calls.
5. **Sales Process Recommendations**
   - Changes to call structure, questions, objection handling, and positioning.

The new platform’s analysis layer (Gemini 1.5 Flash + Claude 3.5 Sonnet) should output **structured JSON** capturing these same sections, which can then be rendered into docs/notes and used as the basis for your Loom review.

---

## 5. What the New System Must Replicate (Non‑Negotiables)

When we automate this workflow, we need to preserve:

- **Closed vs Didn’t‑Close separation** at both source and chunk level.
- **Direct grounding in transcripts** with citations and exact quotes.
- The ability to:
  - See *why* closed calls succeeded vs why didn’t‑close calls failed.
  - Trace every recommendation back to actual customer language.
- The same (or better) structure of output as your current manual reports.

Everything else (UI niceties, podcast/audio, extra features) is optional. The core of the system is:

> “Given 20 labeled calls + context, tell me exactly what’s broken, what’s working, and what to change—backed by quotes.”

This SOP is the target behavior we’ll reproduce with the InsightsLM‑based platform.\n


