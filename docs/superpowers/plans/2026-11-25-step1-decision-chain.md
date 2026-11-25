# Step 1: one full person + AI decision chain — Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Priya works a case with a live engine trace that stops where evidence clashes, decides each account with the AI on a Decision card; overrides of a confident AI go to Vikram; Meera sees every person-vs-AI decision and can run a tamper test.
**Architecture:** New `DECISION` / `SIGNOFF` audit events folded in `desk.ts`; `lib/server/judge.ts` turns an AccountView into the AI view (suggestion, confidence, top clues, clash); UI components DecisionCard + CaseWork; Vikram/Meera pages read the folded decisions.
**Tech Stack:** Next.js 16 server actions, @scalpel/engine, vitest, Playwright; pipeline Python (.venv) to export clue contributions.
**Spec:** docs/superpowers/specs/2026-11-25-role-work-design.md

## Global Constraints
- Name the AI honestly: "the mule-score model" (scored offline) and "the rules engine" (runs live). No "confidence" without the clues behind it.
- Hold amount never above traced (existing rule). Mule ⇒ lien on traced amount only, never whole account.
- Override of an AI suggestion with confidence ≥ 0.8 needs the supervisor's sign-off.
- Reason codes (fixed list): "Evidence matches the suggestion", "Long-standing account with normal history", "Looks like account takeover (SIM swap), not a mule", "Police request can't be used as it is", "Score unclear: hold now, check more", "Phone risk rating disagrees", "Other".
- Trace pace on screen: about 1.4 s per hop; say how long the engine really took.

## Review Focus
- Same account decided twice (double click / two tabs) → second is refused.
- Vikram sends back an override → account is undecided again for Priya, with his note.
- Decision on a ROUTE (unusable) request with choice HOLD → refused with the rule's message.
- Reload mid-flow → CaseWork shows already-decided accounts as done.
- Tamper test never changes the real record.

### Task 1: Export clue contributions (pipeline)
Files: pipeline/scalpel_sim/product.py (`_plain_reasons` also fills `why`), apps/web/data/world.json (regenerated), pipeline/tests/test_product.py.
- [ ] test: every scored account has `score.why` with 5 items `{clue: str, push: float}` sorted by |push| desc; binary clues only phrased as present when value ≥ 0.5.
- [ ] implement; regenerate world.json with `.venv/bin/python -m scalpel_sim.product`; check other fields unchanged (diff counts).

### Task 2: judge.ts (AI view)
Interfaces: `aiView(v: AccountView, now: number): AiView` with `AiView = { suggest: "HOLD"|"NO_HOLD"|"SEND_BACK"; amount: number; confidence: number; headline: string; why: {clue:string; push:number}[]; clash: string | null; point: boolean }`.
Rules: gate ROUTE → SEND_BACK 0.95 point=true; DENY → NO_HOLD 0.9; else HOLD of `v.suggested`, confidence = score (mule) / 1−score (shield) / 0.5. clash: high score & account > 365 days old; phone FRI VERY_HIGH with score < 0.5 or LOW with score ≥ 0.5; 0.2 ≤ score < 0.8; SIM swap within 30 days before first victim money. point = ROUTE or clash.
- [ ] tests: a ROUTE account → SEND_BACK; P00354-style old high-score → clash text mentions years; CASE-001 has ≥ 1 point and ≥ 1 clear account.

### Task 3: DECISION / SIGNOFF in the desk
Interfaces: `decideAccount(u, account, choice, reason, note): ActionResult`; `decideClear(u, caseId, accounts[]): ActionResult`; `signoff(u, did, approved, note): ActionResult`; Desk gains `decisions: Decision[]`, `decisionByAccount: Map<string, Decision>`; `Decision = { did, account, caseId, by, at, ai: {suggest, confidence, clash}, choice, reason, note, agreed, needsSignoff, pid?, signoff?: {by, at, approved, note} }`.
HOLD choice also appends PROPOSE (amount = ai.amount); a proposal decision acts as the sign-off. Rejected sign-off/proposal reopens the account (decisionByAccount drops it) and notifies Priya with the note. `proposeHold` (old path) also writes a DECISION.
- [ ] tests (memory + PGlite): agreed HOLD → proposal; override conf ≥ 0.8 → needsSignoff + Vikram notified; Vikram rejects → reopened; double decide refused; HOLD on ROUTE refused.

### Task 4: DecisionCard + CaseWork (Priya)
Files: components/DecisionCard.tsx, components/WhyBars.tsx, components/CaseWork.tsx (replaces CaseAnalysis on the case page), app/api/trace/[id]/route.ts (runs engine `trace` for the case now, returns hops + elapsed ms), actions decideAccountAction / decideClearAction.
Flow: Start → hop-by-hop graph reveal with a live log → decision points one at a time (n of N) → clear accounts in one card with untick → summary + next step. AccountRow shows decision chip.
- [ ] e2e: Priya starts, overrules a point with a reason, sees "sent to supervisor".

### Task 5: Vikram + Meera
Approvals: each hold shows "AI said / Priya chose / reason"; new "Overrules to sign off" list with approve / send back + note. Assure: person-vs-AI ledger (counts by reason, agreement rate, table) + Tamper test (server copies chain, edits one row, `verifyChain` → names the failing row).
- [ ] e2e: Vikram sends back with note → Priya's case shows the note and the account undecided; Meera sees the decision row and the tamper test names a row.

### Task 6: ship
- [ ] all unit + e2e green; build; commit; bundle; push via laptop; show in Chrome.
