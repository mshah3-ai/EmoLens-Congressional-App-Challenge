"""Validation-study figures (spec 26.5).

Reads the simulator's CSV/JSON outputs and writes fig1..fig8 to docs/figures. Every line is a mean
across simulated families and every shaded band is its 95% interval (mean +/- 1.96 standard errors).

    python analysis/plots.py --in packages/simulator/out --figures docs/figures
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

# Reference palette (dataviz skill, light mode): first three categorical slots validate for all pairs.
BLUE, ORANGE, AQUA = "#2a78d6", "#eb6834", "#1baf7a"
YELLOW, MAGENTA, VIOLET = "#eda100", "#e87ba4", "#4a3aa7"
SURFACE, INK, INK2, MUTED, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#8a8984", "#e6e5e1"
SERIES = [BLUE, ORANGE, AQUA]

plt.rcParams.update({
    "figure.facecolor": SURFACE, "axes.facecolor": SURFACE, "savefig.facecolor": SURFACE,
    "axes.edgecolor": GRID, "axes.labelcolor": INK2, "axes.titlecolor": INK, "axes.titlesize": 11,
    "axes.titleweight": "bold", "axes.labelsize": 9.5, "xtick.color": INK2, "ytick.color": INK2,
    "xtick.labelsize": 8.5, "ytick.labelsize": 8.5, "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.8,
    "axes.spines.top": False, "axes.spines.right": False, "legend.frameon": False, "legend.fontsize": 8.5,
    "font.family": "sans-serif", "lines.linewidth": 2, "lines.solid_capstyle": "round",
})


# Forecast-quality columns score the NEXT 7 days, so the last 7 days have incomplete windows and are not plotted.
WINDOW_COLS = {"auroc7", "skill7", "expectedSkill7", "oracleSkill7", "oracleRealizedSkill7"}


def mean_ci(df: pd.DataFrame, col: str, by: str = "day") -> pd.DataFrame:
    """Per-day mean and 95% interval across families (rows with a missing value are skipped)."""
    if col in WINDOW_COLS:
        df = df[df["day"] <= df["day"].max() - 7]
    g = df.dropna(subset=[col]).groupby(by)[col]
    out = pd.DataFrame({"mean": g.mean(), "sd": g.std(ddof=1), "n": g.count()})
    half = 1.96 * out["sd"].fillna(0) / np.sqrt(out["n"])
    out["lo"], out["hi"] = out["mean"] - half, out["mean"] + half
    return out


def band(ax, df: pd.DataFrame, col: str, color: str, label: str, end_label: str | None = None, lw: float = 2) -> None:
    s = mean_ci(df, col)
    ax.fill_between(s.index, s["lo"], s["hi"], color=color, alpha=0.12, linewidth=0)
    ax.plot(s.index, s["mean"], color=color, lw=lw, label=label)
    if end_label:  # direct label at the line end, in text ink (identity comes from the line)
        ax.annotate(end_label, (s.index[-1], s["mean"].iloc[-1]), xytext=(5, 0), textcoords="offset points",
                    va="center", fontsize=8, color=INK2)


def target(ax, y: float, text: str, x: float | None = None) -> None:
    """Reference line with its label just above it, starting at data x (default: left edge)."""
    ax.axhline(y, color=MUTED, lw=1)
    ax.annotate(text, (ax.get_xlim()[0] if x is None else x, y), xytext=(4, 3), textcoords="offset points", fontsize=7.5, color=INK2)


def read(root: Path, exp: str, arm: str, name: str = "daily_metrics.csv") -> pd.DataFrame:
    return pd.read_csv(root / exp / arm / name)


def finish(fig, path: Path, caption_note: str | None = None) -> None:
    if caption_note:
        fig.text(0.01, 0.005, caption_note, fontsize=7.5, color=MUTED, ha="left", va="bottom")
    fig.tight_layout(rect=(0, 0.03 if caption_note else 0, 1, 1))
    fig.savefig(path, dpi=160)
    plt.close(fig)
    print("wrote", path)


NOTE = "Lines: mean across simulated families. Shaded: 95% interval. Synthetic data from packages/simulator."


def fig1(root: Path, out: Path) -> None:
    d = read(root, "E1", "default")
    fig, (a, b) = plt.subplots(1, 2, figsize=(10, 3.8))
    band(a, d, "detection", BLUE, "Planted triggers found (likely/strong)")
    a.set(title="Real patterns found over time", xlabel="Day of logging", ylabel="Share of planted triggers", ylim=(0, 1))
    target(a, 0.70, "target 0.70 by day 90")
    a.axvline(90, color=GRID, lw=1)
    band(b, d, "nullPossible", ORANGE, "Shown as 'possible link'", "possible")
    band(b, d, "nullLikelyStrong", BLUE, "Shown as 'likely' or 'strong'", "likely/strong")
    b.set(title="Fake patterns (factors with no real effect)", xlabel="Day of logging", ylabel="Share of null factors", ylim=(0, 0.25))
    target(b, 0.05, "limit 0.05 for likely/strong", x=55)
    b.legend(loc="upper left", bbox_to_anchor=(0, 0.93))
    finish(fig, out / "fig1_learning_curve.png", NOTE)


def fig2(root: Path, out: Path) -> None:
    d = read(root, "E1", "default")
    s = json.loads((root / "E1" / "default" / "summary.json").read_text())
    pooled = pd.DataFrame([{"day": x["day"], "auc": x["pooledAuroc7"]} for x in s["byDay"]]).dropna()
    pooled = pooled[pooled["day"] <= s["days"] - 7]
    fig, (a, b) = plt.subplots(1, 2, figsize=(10, 3.8))
    band(a, d, "auroc7", BLUE, "Per-family AUROC (mean)")
    a.plot(pooled["day"], pooled["auc"], color=ORANGE, lw=2, label="All families pooled")
    a.axhline(0.5, color=MUTED, lw=1)
    a.set(title="Ranking risky vs calm blocks (next 7 days)", xlabel="Day of logging", ylabel="AUROC (0.5 = coin flip)", ylim=(0.45, 0.7))
    a.legend(loc="upper left")
    band(b, d, "oracleSkill7", AQUA, "Oracle (knows the true chance)", "oracle")
    band(b, d, "expectedSkill7", BLUE, "EmoLens, expected skill", "EmoLens (expected)")
    band(b, d, "skill7", ORANGE, "EmoLens, realized skill", "EmoLens (realized)", lw=1.5)
    b.axhline(0, color=MUTED, lw=1)
    b.set(title="Skill vs a time-of-day guess (next 7 days)", xlabel="Day of logging", ylabel="Skill score (1 - Brier / baseline)")
    b.legend(loc="upper right", fontsize=7.5)
    finish(fig, out / "fig2_forecast_quality.png", NOTE)


def fig3(root: Path, out: Path) -> None:
    s = json.loads((root / "E1" / "default" / "summary.json").read_text())
    c = pd.DataFrame(s["calibration"]).dropna(subset=["meanP"])
    fig, ax = plt.subplots(figsize=(5.4, 4.6))
    lim = float(max(c["meanP"].max(), c["rateHi"].max(), c["meanPTrue"].max()) * 1.1)
    ax.plot([0, lim], [0, lim], color=MUTED, lw=1)
    ax.annotate("perfect calibration", (lim * 0.62, lim * 0.62), xytext=(4, -10), textcoords="offset points", fontsize=7.5, color=INK2, rotation=0)
    ax.errorbar(c["meanP"], c["rate"], yerr=[c["rate"] - c["rateLo"], c["rateHi"] - c["rate"]], fmt="o", color=BLUE, ms=6,
                mec=SURFACE, mew=2, elinewidth=1.5, capsize=0, label="Observed rate of hard moments (95% interval)")
    ax.plot(c["meanP"], c["meanPTrue"], "s", color=ORANGE, ms=6, mec=SURFACE, mew=2, label="Average true chance")
    for _, r in c.iterrows():
        ax.annotate(f"n={int(r['n']):,}", (r["meanP"], r["rate"]), xytext=(7, -3), textcoords="offset points", fontsize=7, color=MUTED)
    ax.set(title="Calibration of day-ahead forecasts (day 30+)", xlabel="EmoLens forecast (mean within bin)",
           ylabel="What actually happened", xlim=(0, lim), ylim=(0, lim))
    ax.legend(loc="upper left", fontsize=7.5)
    finish(fig, out / "fig3_calibration.png", "Bins 0-5-10-20-35-100% (spec 18). Intervened blocks excluded.")


def fig4(root: Path, out: Path) -> None:
    fig, axes = plt.subplots(2, 3, figsize=(12, 6.6), sharex=True)
    for col, ip in enumerate([0.3, 0.5, 0.8]):
        e, n = read(root, "E2", f"emolens_ip{ip}"), read(root, "E2", f"naive_ip{ip}")
        top, bottom = axes[0][col], axes[1][col]
        band(top, e, "meanPlantedBetaRatio", BLUE, "EmoLens labels (stepped in = excluded)")
        band(top, n, "meanPlantedBetaRatio", ORANGE, "Naive labels (stepped in = calm)")
        top.set(title=f"Parents step in {int(ip * 100)}% of alerts", ylim=(0.6, 0.8))
        # paired difference: same simulated children, only the labeling rule differs
        m = e[["family", "day", "meanPlantedBetaRatio"]].merge(n[["family", "day", "meanPlantedBetaRatio"]], on=["family", "day"], suffixes=("_e", "_n"))
        m["diff"] = m["meanPlantedBetaRatio_e"] - m["meanPlantedBetaRatio_n"]
        band(bottom, m, "diff", VIOLET, "EmoLens minus naive")
        bottom.axhline(0, color=MUTED, lw=1)
        bottom.set(xlabel="Day of logging", ylim=(-0.01, 0.03))
    axes[0][0].set_ylabel("Estimated / true effect\n(mean over planted triggers)")
    axes[1][0].set_ylabel("Difference, same children\n(EmoLens minus naive)")
    axes[0][0].legend(loc="upper left", fontsize=7.5)
    fig.suptitle("The intervention trap: how labeling 'we stepped in' changes what the model learns", fontsize=11, color=INK, fontweight="bold")
    finish(fig, out / "fig4_intervention_trap.png", NOTE + " Top: 1.0 would mean the effect is recovered exactly.")


def fig5(root: Path, out: Path) -> None:
    arms = [("tau_selected", "Empirical-Bayes shrinkage (EmoLens)", BLUE), ("tau_fixed_1", "No shrinkage selection (tau = 1)", ORANGE),
            ("weak_prior", "Weak prior (sd = 5)", AQUA)]
    fig, axes = plt.subplots(1, 3, figsize=(12, 3.8))
    for arm, label, color in arms:
        d = read(root, "E3", arm)
        band(axes[0], d, "nullLikelyStrong", color, label)
        band(axes[1], d, "nullPossible", color, label)
        band(axes[2], d, "detection", color, label)
    axes[0].set(title="Fake 'likely/strong' patterns", xlabel="Day of logging", ylabel="Share of null factors")
    target(axes[0], 0.05, "limit 0.05")
    axes[1].set(title="Fake 'possible' patterns", xlabel="Day of logging", ylabel="Share of null factors")
    axes[2].set(title="Real patterns found", xlabel="Day of logging", ylabel="Share of planted triggers", ylim=(0, 1))
    axes[2].legend(loc="upper left", fontsize=7.5)
    finish(fig, out / "fig5_shrinkage.png", NOTE)


def fig6(root: Path, out: Path) -> None:
    fig, axes = plt.subplots(2, 2, figsize=(10, 7), sharex=True, sharey="row")
    for col, eod in enumerate([0.9, 0.6]):
        for lr, color in zip([1.0, 0.8, 0.6], SERIES):
            d = read(root, "E4", f"log{lr:g}_eod{eod:g}")
            band(axes[0][col], d, "detection", color, f"logs {int(lr * 100)}% of hard moments", f"{int(lr * 100)}%")
            band(axes[1][col], d, "expectedSkill7", color, f"logs {int(lr * 100)}%", f"{int(lr * 100)}%")
        axes[0][col].set(title=f"End-of-day check done {int(eod * 100)}% of days", ylabel="Planted triggers found", ylim=(0, 1))
        axes[1][col].set(xlabel="Day of logging", ylabel="Expected skill (next 7 days)")
        axes[1][col].axhline(0, color=MUTED, lw=1)
    axes[0][0].legend(loc="upper left", fontsize=7.5)
    fig.suptitle("How logging diligence changes learning", fontsize=11, color=INK, fontweight="bold")
    finish(fig, out / "fig6_compliance.png", NOTE)


STATUS_ORDER = [("not_enough_data", "Not enough data", "#d9d8d4"), ("checking", "Still checking", "#a8a7a2"),
                ("no_clear_link", "No clear link", BLUE), ("protective", "Linked to calmer times", AQUA),
                ("possible", "Possible link", YELLOW), ("likely_strong", "Likely/strong link", ORANGE)]


def status_shares(d: pd.DataFrame, key: str) -> pd.DataFrame:
    s = d[f"status_{key}"].replace({"likely": "likely_strong", "strong": "likely_strong"})
    t = pd.crosstab(d["day"], s, normalize="index")
    return t.reindex(columns=[k for k, _, _ in STATUS_ORDER], fill_value=0)


def fig7(root: Path, out: Path) -> None:
    d = read(root, "E5", "default")
    fig, axes = plt.subplots(1, 2, figsize=(11, 4), sharey=True)
    for ax, key, title in [(axes[0], "high_sugar_recent", "Sugary snack (parent suspects it; truly NO effect)"),
                           (axes[1], "sleep_deficit", "Short sleep (parent suspects it; truly raises risk)")]:
        t = status_shares(d, key)
        ax.stackplot(t.index, *[t[k] for k, _, _ in STATUS_ORDER], colors=[c for _, _, c in STATUS_ORDER],
                     labels=[lab for _, lab, _ in STATUS_ORDER], edgecolor=SURFACE, linewidth=0.6)
        ax.set(title=title, xlabel="Day of logging", ylim=(0, 1), xlim=(t.index.min(), t.index.max()))
        ax.grid(False)
    axes[0].set_ylabel("Share of families")
    handles, labels = axes[0].get_legend_handles_labels()
    fig.legend(handles, labels, loc="lower center", ncol=6, fontsize=8, bbox_to_anchor=(0.5, 0.04))
    fig.suptitle("Can the data overrule a wrong parent belief? What families see on the Insights screen", fontsize=11, color=INK, fontweight="bold")
    fig.tight_layout(rect=(0, 0.1, 1, 1))
    fig.text(0.01, 0.005, "Share of simulated families whose Insights screen shows each status, by day. Synthetic data.", fontsize=7.5, color=MUTED)
    fig.savefig(out / "fig7_wrong_belief.png", dpi=160)
    plt.close(fig)
    print("wrote", out / "fig7_wrong_belief.png")


def fig8(root: Path, out: Path) -> None:
    w, wo = read(root, "E6", "with_physiology"), read(root, "E6", "without_physiology")
    fig, axes = plt.subplots(1, 3, figsize=(12, 3.8))
    for d, label, color in [(w, "Heart-rate data used", BLUE), (wo, "Heart-rate data not used", ORANGE)]:
        band(axes[0], d, "auroc7", color, label)
        band(axes[1], d, "expectedSkill7", color, label)
    band(axes[1], w, "oracleSkill7", AQUA, "Oracle", "oracle", lw=1.5)
    w = w.assign(hr_found=w["status_hr_elevated_pre"].isin(["likely", "strong"]).astype(float))
    band(axes[2], w, "hr_found", BLUE, "Heart rate before the block")
    axes[0].set(title="Ranking (AUROC, next 7 days)", xlabel="Day of logging", ylabel="AUROC")
    axes[0].axhline(0.5, color=MUTED, lw=1)
    axes[1].set(title="Expected skill (next 7 days)", xlabel="Day of logging", ylabel="Skill score")
    axes[1].axhline(0, color=MUTED, lw=1)
    axes[2].set(title="Heart-rate trigger found", xlabel="Day of logging", ylabel="Share of families (likely/strong)", ylim=(0, 1))
    axes[0].legend(loc="upper left", fontsize=7.5)
    finish(fig, out / "fig8_physiology.png", NOTE + " The planted heart-rate effect exists in both arms.")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--in", dest="inp", default="packages/simulator/out")
    ap.add_argument("--figures", default="docs/figures")
    args = ap.parse_args()
    root, out = Path(args.inp), Path(args.figures)
    out.mkdir(parents=True, exist_ok=True)
    for f in (fig1, fig2, fig3, fig4, fig5, fig6, fig7, fig8):
        f(root, out)


if __name__ == "__main__":
    main()
