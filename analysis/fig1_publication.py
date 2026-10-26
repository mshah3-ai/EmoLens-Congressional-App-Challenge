"""
Publication-style Figure 1 (learning curve) for EmoLens, in the style of Nature figures:
lowercase bold panel letters, no chart titles in the plot area, left/bottom axes only,
outward ticks, thin lines, light 95% bands, direct labels instead of legends, dashed thresholds.

Input: a tidy CSV with ONE ROW PER (family, day) and these columns (rename with flags if needed):
  day                 simulated day of logging (int)
  family              family id
  detection           share of planted triggers at likely/strong for that family on that day (0-1)
  null_likely         share of no-effect factors at likely/strong (0-1)
  null_possible       share of no-effect factors at possible (0-1)

Every number drawn and annotated is computed from the CSV. Nothing is hard-coded.

Usage:
  python analysis/fig1_publication.py --csv <daily_metrics.csv> --out docs/figures/fig1_publication
Writes <out>_video.png (1920x1080, for the demo video) and <out>_print.pdf/.png (180 mm wide).
"""
import argparse

import numpy as np
import pandas as pd
import matplotlib as mpl
import matplotlib.pyplot as plt
from matplotlib.ticker import PercentFormatter, MultipleLocator

BLUE = "#1F4E9C"        # detection (main result)
BLUE_BAND = "#1F4E9C"
RED = "#B3261E"         # fake likely/strong (the guardrail)
GREY = "#8C8C8C"        # secondary series / reference lines
INK = "#1A1A1A"


def style(scale: float) -> None:
    mpl.rcParams.update({
        "font.family": "sans-serif",
        "font.sans-serif": ["Helvetica", "Arial", "Inter", "DejaVu Sans"],
        "font.size": 7 * scale,
        "axes.labelsize": 7 * scale,
        "xtick.labelsize": 6.5 * scale,
        "ytick.labelsize": 6.5 * scale,
        "axes.linewidth": 0.6 * scale,
        "xtick.major.width": 0.6 * scale,
        "ytick.major.width": 0.6 * scale,
        "xtick.major.size": 2.5 * scale,
        "ytick.major.size": 2.5 * scale,
        "xtick.direction": "out",
        "ytick.direction": "out",
        "axes.spines.top": False,
        "axes.spines.right": False,
        "axes.edgecolor": INK,
        "axes.labelcolor": INK,
        "xtick.color": INK,
        "ytick.color": INK,
        "text.color": INK,
        "axes.grid": False,
        "figure.facecolor": "white",
        "axes.facecolor": "white",
        "savefig.facecolor": "white",
        "pdf.fonttype": 42,
    })


def summarize(df: pd.DataFrame, col: str) -> pd.DataFrame:
    g = df.groupby("day")[col]
    out = pd.DataFrame({"mean": g.mean(), "sd": g.std(ddof=1), "n": g.count()})
    half = 1.96 * out["sd"] / np.sqrt(out["n"])
    out["lo"] = (out["mean"] - half).clip(lower=0)
    out["hi"] = (out["mean"] + half).clip(upper=1)
    return out.reset_index()


def band(ax, s, color, lw, alpha, label_side=None):
    ax.fill_between(s["day"], s["lo"], s["hi"], color=color, alpha=alpha, linewidth=0)
    ax.plot(s["day"], s["mean"], color=color, lw=lw, solid_capstyle="round")


def value_at(s, day):
    row = s.loc[(s["day"] - day).abs().idxmin()]
    return row


def draw(df, out_path, video: bool):
    scale = 1.9 if video else 1.0
    style(scale)
    if video:
        fig = plt.figure(figsize=(1920 / 200, 1080 / 200), dpi=200)
        gs = fig.add_gridspec(1, 2, left=0.105, right=0.86, bottom=0.2, top=0.84, wspace=0.42)
    else:
        fig = plt.figure(figsize=(180 / 25.4, 70 / 25.4), dpi=300)
        gs = fig.add_gridspec(1, 2, left=0.1, right=0.86, bottom=0.2, top=0.86, wspace=0.42)
    ax_a, ax_b = fig.add_subplot(gs[0]), fig.add_subplot(gs[1])

    det = summarize(df, "detection")
    nl = summarize(df, "null_likely")
    npos = summarize(df, "null_possible")
    n_fam = int(df["family"].nunique())
    max_day = int(df["day"].max())

    # ---------- panel a: real patterns found ----------
    ax = ax_a
    ax.axhline(0.70, color=GREY, lw=0.6 * scale, ls=(0, (4, 3)))
    ax.text(max_day, 0.685, "pre-set target 70%", color=GREY,
            fontsize=6 * scale, va="top", ha="right")
    band(ax, det, BLUE, 1.1 * scale, 0.16)
    for d in (90, max_day):
        r = value_at(det, d)
        ax.plot(r["day"], r["mean"], "o", ms=3.2 * scale, mfc="white", mec=BLUE, mew=0.9 * scale, zorder=5)
        ax.annotate(f"day {int(r['day'])}", (r["day"], r["mean"]),
                    xytext=(0, 7 * scale), textcoords="offset points",
                    ha="center", va="bottom", color=GREY, fontsize=5.6 * scale)
        ax.annotate(f"{r['mean']*100:.0f}%", (r["day"], r["mean"]),
                    xytext=(0, 13.5 * scale), textcoords="offset points",
                    ha="center", va="bottom", color=BLUE, fontsize=7.5 * scale, fontweight="bold")
    ax.set_xlim(0, max_day + 4)
    ax.set_ylim(0, 1.05)
    ax.yaxis.set_major_formatter(PercentFormatter(1.0, decimals=0))
    ax.yaxis.set_major_locator(MultipleLocator(0.25))
    ax.xaxis.set_major_locator(MultipleLocator(30))
    ax.set_xlabel("Day of logging")
    ax.set_ylabel("Real triggers found")
    ax.set_title("Finds real patterns", loc="left", fontsize=7.5 * scale, fontweight="bold", pad=6 * scale)

    # ---------- panel b: fake patterns ----------
    ax = ax_b
    ax.axhline(0.05, color=GREY, lw=0.6 * scale, ls=(0, (4, 3)))
    ax.text(max_day, 0.0535, "pre-set limit 5%", color=GREY,
            fontsize=6 * scale, va="bottom", ha="right")
    band(ax, npos, GREY, 0.9 * scale, 0.18)
    band(ax, nl, RED, 1.1 * scale, 0.16)
    worst = nl.loc[nl["mean"].idxmax()]
    ax.plot(worst["day"], worst["mean"], "o", ms=3.2 * scale, mfc="white", mec=RED, mew=0.9 * scale, zorder=5)
    ax.annotate(f"worst day: {worst['mean']*100:.1f}%", (worst["day"], worst["mean"]),
                xytext=(max_day * 0.62, 0.012), textcoords="data", ha="center", va="center",
                color=RED, fontsize=6 * scale, fontweight="bold",
                arrowprops=dict(arrowstyle="-", color=RED, lw=0.6 * scale, shrinkA=2, shrinkB=4))
    last_p, last_l = npos.iloc[-1], nl.iloc[-1]
    ax.text(last_p["day"] + 2.5, last_p["mean"], "possible\nlink",
            color="#5A5A5A", fontsize=5.8 * scale, va="center", ha="left")
    ax.text(last_l["day"] + 2.5, last_l["mean"], "likely or\nstrong link", color=RED,
            fontsize=5.8 * scale, va="center", ha="left", fontweight="bold")
    ax.set_xlim(0, max_day + 4)
    top = max(0.15, float(npos["hi"].max()) * 1.15)
    ax.set_ylim(0, top)
    ax.yaxis.set_major_formatter(PercentFormatter(1.0, decimals=0))
    ax.yaxis.set_major_locator(MultipleLocator(0.05))
    ax.xaxis.set_major_locator(MultipleLocator(30))
    ax.set_xlabel("Day of logging")
    ax.set_ylabel("No-effect factors flagged")
    ax.set_title("Rarely invents fake ones", loc="left", fontsize=7.5 * scale, fontweight="bold", pad=6 * scale)

    for ax, letter in ((ax_a, "a"), (ax_b, "b")):
        ax.text(-0.24, 1.06, letter, transform=ax.transAxes, fontsize=9 * scale,
                fontweight="bold", va="bottom", ha="left")

    fig.text(0.105 if video else 0.1, 0.02,
             f"Mean across {n_fam} simulated families (synthetic data, planted triggers known); shading, 95% CI.",
             fontsize=5.6 * scale, color=GREY, ha="left")

    if video:
        fig.savefig(f"{out_path}_video.png", dpi=200)
    else:
        fig.savefig(f"{out_path}_print.pdf")
        fig.savefig(f"{out_path}_print.png", dpi=300)
    plt.close(fig)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--csv", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--preview-label", default="")
    a = p.parse_args()
    df = pd.read_csv(a.csv)
    # the simulator's daily_metrics.csv names (packages/simulator/out/<exp>/<arm>/); a rename only, values unchanged
    df = df.rename(columns={"nullLikelyStrong": "null_likely", "nullPossible": "null_possible"})
    need = {"day", "family", "detection", "null_likely", "null_possible"}
    missing = need - set(df.columns)
    if missing:
        raise SystemExit(f"CSV is missing columns {sorted(missing)}; rename or reshape first.")
    draw(df, a.out, video=True)
    draw(df, a.out, video=False)
    print("wrote", a.out + "_video.png", a.out + "_print.pdf", a.out + "_print.png")


if __name__ == "__main__":
    main()
