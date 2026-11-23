/**
 * Checks an incoming freeze request before any money is touched.
 * VALID / DEFECTIVE (with reasons) / NEEDS_REVIEW, plus what authority the request carries in its state.
 */
import type { Paise } from "./money";
import type { Instant } from "./time";
import type { StateCode } from "./jurisdiction";
import { strictestJurisdiction, unverifiedSources, type Overlay, type PolicySet } from "./policy";

export type LegalBasis = "BNSS_106" | "BNSS_107" | "CRPC_102" | "COURT_ORDER" | "DOT_DIRECTION";

export const RANKS = ["Constable", "Head Constable", "Assistant Sub-Inspector", "Sub-Inspector", "Inspector", "Deputy Superintendent", "Superintendent", "Deputy Inspector General", "Inspector General", "Director General"] as const;
export type Rank = (typeof RANKS)[number];

export interface Requisition {
  id: string;
  receivedAt: Instant;
  basis: LegalBasis;
  issuer: { name: string; rank?: Rank; station: string; state: StateCode };
  signed: boolean;
  signedAt?: Instant;
  firNo?: string;
  ncrpAck?: string;
  amountRequested?: Paise | null;
  asksWholeAccount: boolean;
  account: { id: string; branchState: StateCode; holderState?: StateCode };
  linkedTxnIds: string[];
  natureDeclared: "criminal" | "civil" | "unclear";
  magistrateIntimatedAt?: Instant | null;
  magistrateOrderRef?: string;
}

export type PoliceAuthority = "FULL" | "EXACT_ONLY" | "NONE";
export interface Finding { checkId: string; ok: boolean; pending?: boolean; severity: "defect" | "review"; message: string; sources: string[]; /** cited sources not yet verified */ unverified: string[] }

export interface RequisitionResult {
  status: "VALID" | "DEFECTIVE" | "NEEDS_REVIEW";
  findings: Finding[];
  authority: PoliceAuthority;
  route?: "MAGISTRATE_S107";
  jurisdiction: ReturnType<typeof strictestJurisdiction>;
  memo: string[];
}

// Format rules are placeholders until research prompt R2 confirms the real formats.
const FIR_RE = /^\s*\d{1,6}\s*\/\s*(19|20)\d{2}\s*$/;
const NCRP_RE = /^\d{10,20}$/;
const H24 = 24 * 3600 * 1000;

export function checkRequisition(req: Requisition, policy: PolicySet, overlays: Overlay[]): RequisitionResult {
  const findings: Finding[] = [];
  const add = (checkId: string, ok: boolean, message: string, extra: Partial<Finding> = {}) => {
    const def = policy.requisition.checks.find((c) => c.id === checkId);
    if (!def || !def.applies_to.includes(req.basis)) return;
    findings.push({ checkId, ok, severity: def.severity, message: ok ? def.label : message, sources: def.sources, unverified: unverifiedSources(policy, def.sources), ...extra });
  };

  const minRank = RANKS.indexOf(policy.requisition.min_signing_rank as Rank);
  const rankOk = req.issuer.rank !== undefined && (minRank < 0 || RANKS.indexOf(req.issuer.rank) >= minRank);
  add("signed_dated", req.signed && req.signedAt !== undefined && rankOk,
    !req.signed || req.signedAt === undefined ? "Request is not signed and dated" : `Signed by ${req.issuer.rank ?? "unknown rank"}; needs at least ${policy.requisition.min_signing_rank}`);

  const ref = (req.firNo && FIR_RE.test(req.firNo)) || (req.ncrpAck && NCRP_RE.test(req.ncrpAck));
  add("case_reference", Boolean(ref), req.firNo || req.ncrpAck ? "FIR / NCRP number is in an unrecognised format" : "No FIR or NCRP acknowledgement number");

  const amountOk = !req.asksWholeAccount && typeof req.amountRequested === "number" && req.amountRequested > 0;
  add("exact_amount", amountOk, req.asksWholeAccount ? "Asks to freeze the whole account instead of an exact amount" : "No exact amount stated");

  add("account_nexus", req.linkedTxnIds.length > 0, "Does not identify the fraud transaction that links this account");

  add("criminal_nature", req.natureDeclared === "criminal",
    req.natureDeclared === "civil" ? "Looks like a civil/commercial dispute, which is not a ground for a criminal freeze" : "Nature of the offence is unclear");

  const hrs = policy.requisition.magistrate_intimation_hours * 3600 * 1000;
  if (req.basis === "BNSS_106" || req.basis === "CRPC_102") {
    const start = req.signedAt ?? req.receivedAt;
    if (req.magistrateIntimatedAt != null) {
      add("magistrate_intimation", req.magistrateIntimatedAt - start <= hrs, `Magistrate informed after more than ${policy.requisition.magistrate_intimation_hours} hours`);
    } else if (req.receivedAt - start < hrs) {
      add("magistrate_intimation", false, `Proof of informing the Magistrate is due within ${policy.requisition.magistrate_intimation_hours} hours`, { pending: true, severity: "review" });
    } else {
      add("magistrate_intimation", false, "No proof the Magistrate was informed");
    }
  }
  add("magistrate_order", Boolean(req.magistrateOrderRef), "No Magistrate's order attached");

  const states = [req.account.branchState, req.issuer.state, ...(req.account.holderState ? [req.account.holderState] : [])];
  const jurisdiction = strictestJurisdiction(overlays, states, req.receivedAt);
  let authority: PoliceAuthority = "FULL";
  let route: RequisitionResult["route"];
  if (req.basis === "BNSS_106" || req.basis === "CRPC_102") {
    const p = jurisdiction.strictest.power;
    if (p === "not_allowed") { authority = "NONE"; route = "MAGISTRATE_S107"; }
    else if (p === "unsettled") authority = "EXACT_ONLY";
  }

  const defects = findings.filter((f) => !f.ok && f.severity === "defect" && !f.pending);
  const reviews = findings.filter((f) => !f.ok && (f.severity === "review" || f.pending));
  const status = defects.length ? "DEFECTIVE" : reviews.length ? "NEEDS_REVIEW" : "VALID";

  const memo: string[] = [];
  defects.forEach((f, i) => memo.push(`${i + 1}. ${f.message}.`));
  if (route) memo.push(`${memo.length + 1}. In ${jurisdiction.strictest.highCourt} High Court's area, police cannot debit-freeze under BNSS s.106 alone. Please obtain a Magistrate's order under s.107.`);
  if (jurisdiction.conflict) memo.push(`Note: the states involved (${jurisdiction.views.map((v) => v.state).join(", ")}) follow different rulings; the strictest was applied.`);

  return { status, findings, authority, route, jurisdiction, memo };
}
