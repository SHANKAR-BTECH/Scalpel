"""Turn the AI's top 3 contributions into plain sentences an officer (and a viva panel) can read."""
from __future__ import annotations


def _n(x: float) -> str:
    return f"{x:.0f}"


# feature -> (sentence when it pushes the mule score UP, sentence when it pushes it DOWN)
TEXT = {
    "age_days": (lambda v: f"Account opened only {_n(v)} days ago", lambda v: f"Account has a long history ({_n(v)} days)"),
    "days_since_kyc": (lambda v: f"Contact details changed {_n(v)} days ago", lambda v: "No recent change to contact details"),
    "is_current": (lambda v: "Account type is often misused", lambda v: "Business current account with regular trade"),
    "is_salary": (lambda v: "Account type is often misused", lambda v: "Salary account with regular income"),
    "dwell_median_min": (lambda v: f"Money left within {_n(v)} minutes of arriving",
                         lambda v: f"Money usually stays a long time ({_n(v)} minutes or more)"),
    "senders": (lambda v: "All the money came from one sender" if v == 1 else f"Money came from {_n(v)} different senders",
                lambda v: f"Few senders ({_n(v)})"),
    "reported_senders": (lambda v: f"{_n(v)} people who reported fraud paid into this account",
                         lambda v: "Few or no fraud reporters paid into this account"),
    "share_in_reported": (lambda v: f"{v:.0%} of money in came from reported fraud", lambda v: "Most money in is not from reported fraud"),
    "share_out_exits": (lambda v: f"{v:.0%} of money out left as cash, crypto or gold",
                        lambda v: "Little money leaves as cash, crypto or gold"),
    "txns_per_day": (lambda v: f"Busy account ({v:.1f} payments a day)", lambda v: f"Quiet, steady account ({v:.1f} payments a day)"),
    "sim_swap": (lambda v: "SIM card swapped in the last 3 days", lambda v: "No recent SIM swap"),
    "handset_farm": (lambda v: "Phone handset shared by more than 5 SIMs", lambda v: "Phone handset not shared"),
    "call_forwarding": (lambda v: "Call forwarding is switched on", lambda v: "No call forwarding"),
    "mnrl": (lambda v: "Number is on the MNRL list of revoked numbers", lambda v: "Number not on the MNRL list"),
    "fri_very_high": (lambda v: "DoT fraud-risk rating for the number is Very High", lambda v: "DoT fraud-risk rating is not Very High"),
    "simbox": (lambda v: "Calls routed through a SIM box", lambda v: "No SIM-box routing"),
    "sign_count": (lambda v: f"{_n(v)} warning signs at once", lambda v: "No warning signs" if v == 0 else f"Only {_n(v)} warning sign{'s' if v != 1 else ''}"),
}


def reasons_for(values: dict[str, float], contributions: dict[str, float], k: int = 3) -> list[str]:
    """Pick the k features that moved the mule score most (either way) and phrase them."""
    top = sorted(contributions, key=lambda f: (-abs(contributions[f]), f))[:k]
    out = []
    for f in top:
        up, down = TEXT[f]
        out.append(up(values[f]) if contributions[f] > 0 else down(values[f]))
    return out
