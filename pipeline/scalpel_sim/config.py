"""Every setting of a fake world in one place.

v1 is for building and training. v2 (configs/v2.py) changes some settings on purpose
and is locked before any training, so nobody can tune it to make the AI look good.
"""
from __future__ import annotations

from dataclasses import dataclass, field, replace


@dataclass(frozen=True)
class ScamType:
    name: str
    share: float                 # share of campaigns of this type
    victims: tuple[int, int]     # victims per campaign
    amount_rupees: tuple[int, int]


@dataclass(frozen=True)
class WorldConfig:
    name: str = "v1"
    seed: int = 101
    n_accounts: int = 5000
    days: int = 30
    cutoff_day: int = 22          # the decision moment (start of this day)
    after_hours: int = 72         # how long the hidden "what happens next" runs
    mule_share: float = 0.03
    shield_share: float = 0.02
    campaigns: int = 30
    scams: tuple[ScamType, ...] = (
        ScamType("investment", 0.30, (6, 20), (20_000, 200_000)),
        ScamType("digital_arrest", 0.20, (3, 10), (50_000, 500_000)),
        ScamType("kyc_update", 0.25, (8, 25), (5_000, 60_000)),
        ScamType("part_time_job", 0.25, (8, 25), (2_000, 40_000)),
    )
    hops: tuple[int, int] = (3, 5)
    campaign_days: tuple[int, int] = (2, 6)
    # Mule habits (v2 changes these)
    mule_age_days: tuple[int, int] = (3, 28)      # account age at the decision moment
    mule_old_rented_share: float = 0.35           # mules that are old "rented" accounts
    mule_dwell_minutes: tuple[int, int] = (2, 60)
    mule_kyc_change_share: float = 0.3
    mule_forward_share: tuple[int, int] = (70, 95)  # % of each receipt passed on
    shop_spend_share: tuple[int, int] = (2, 10)     # % a mule spends at a shop (how shields get scam money)
    # Victims
    report_rate: tuple[float, float] = (0.4, 0.7)
    report_delay_hours: tuple[int, int] = (0, 72)
    # After the decision moment (hidden): hourly drain of victim money
    mule_drain_per_hour: float = 0.15
    drain_ratio: float = 5.0       # mule money leaves this many times faster than a shop's
    normal_txns_per_account_day: float = 0.33
    signal_noise: str = "low"      # "low" or "high": how blurry the phone signs are
    extra: dict = field(default_factory=dict)

    def scaled(self, f: float) -> "WorldConfig":
        return replace(self, n_accounts=int(self.n_accounts * f), campaigns=max(4, int(self.campaigns * f)))

    def with_seed(self, seed: int) -> "WorldConfig":
        return replace(self, seed=seed)


def v1_config() -> WorldConfig:
    return WorldConfig()
