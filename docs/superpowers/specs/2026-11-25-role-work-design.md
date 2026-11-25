# Scalpel: person + AI working together in every role (plan, 25 Nov)

Made with: idea pass, a council of 4 (Architect, Skeptic, Pragmatist, Researcher) and a roast panel of 5 (Critic 4, Champion 8, Analyst 5, Investigator 7, Mentor 7).
Verdict: RESHAPE. Right direction, but (1) the AI's scores are almost always sure (102 of 103 near 0 or 1), so real decisions must come from evidence that disagrees; (2) the bank must not see Telco call records; (3) six half-built desks would crash live. So: build one airtight chain first, then widen.

## The test every role's work must pass (grill)
1. The rules alone can't answer it (a real judgement, not a quiz).
2. The choice changes something you can see (money, a block, another person's queue).
3. The world has evidence on both sides (planted where missing, labelled fictional).
4. The AI shows WHY on demand: the 3 clues that pushed the score most, named "the mule-score model" + "rules engine", never just "AI".

## One shared piece: the Decision card
AI suggestion + confidence + "Why?" -> person agrees or overrules, picks a reason (list set by admin) + note -> written to the tamper-proof record -> next person gets it in their queue. Overruling a confident AI needs the supervisor.

## Per role
- Priya (officer): "Start trace" runs the real engine on a case, hop by hop at medium pace, stopping only where evidence disagrees: a police request that can't be used (42 of 116), a high-score account that is years old (8), the one unclear score, a Telco risk band that contradicts the score (25+3). She decides each; flags beneficiary phone numbers to Telco-A; marks confirmed mules (shared suspect list).
- Imran (Telco-A): queue of number checks from the bank; his AI proposes a risk band (Medium/High/Very High, modelled on DoT's FRI via DIP) from network signals; he sets the band; the bank's action changes by band (warn / delay / hold). SIM-box alerts including one genuine business device (planted) that he should dismiss; block scope with innocent-line estimate. Call records go only into a police packet, never to the bank.
- Vikram (supervisor): four-eyes queue: overrides of confident AI, holds on long-standing salary/pensioner accounts, send-backs. Approve or send back with a note that lands in Priya's queue. Mentor can play Vikram on a phone (QR code).
- Meera (auditor): human-vs-AI ledger by reason; AI picks a risky sample of 5 holds to check pass/fail with a finding; tamper drill (change one row, verification names it). A finding can go to Asha.
- Account holder: explains with invoice details; the rules check them against the real incoming payment (one planted match, one mismatch); Priya recommends. Release route shown honestly: under Rs 50k refund route; above that the investigating officer decides (simulated, labelled).
- Asha (admin): owns reason codes; changes the mule threshold with a preview of which accounts move (from Meera's finding), saved as a dated rule version.

## Build order
1. Shared database (Neon) connected + reset to a known start. Decision card + "Why?" + Priya's live trace + Vikram four-eyes + Meera ledger. (One full chain.)
2. Joint case: number flags -> Imran's risk band -> bank action ladder; SIM-box alerts incl. the genuine device; police packet.
3. Holder explanation check + release route; Meera's sample audit; Asha's threshold change.
4. Live new case: Asha releases a prepared case; calls appear live on Telco-A's console, complaints arrive, the trace grows. (Labelled simulator.)

## Not doing
- Money-racing clock (fragile, adds no judgement). Live chatbot/LLM. Retraining the model in the browser. Hindi. Real phone/SMS.
- Bank seeing call records.

## Facts to fix before viva
- Grievance timing: the 2 Jan 2026 MHA SOP (per LiveLaw commentary) escalates after 15 days; Rs 50k refund split. Check the SOP text.
