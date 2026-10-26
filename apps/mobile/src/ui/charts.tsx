/**
 * Small charts for Insights and Model Health, drawn with react-native-svg (SPEC 9.4-9.7, 18).
 * Rules (so they read calmly and honestly):
 *  - one data hue (primary); intervals are a light wash or a thin whisker, never a second loud color;
 *  - thin marks (bars <= 24 pt, 2 pt lines, dots >= 8 pt with a ring in the surface color), hairline grid;
 *  - text is always in text colors, never in the data color; labels are sparing;
 *  - every chart has a plain-language `accessibilityLabel` summary (SPEC 28.2), and tapping a bar/dot shows its numbers.
 */
import { useState, type ReactNode } from 'react';
import { Pressable, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { T } from './Text';
import { radius, space, tint, useTheme } from './theme';

const useWidth = (initial = 300): [number, (e: LayoutChangeEvent) => void] => {
  const [w, setW] = useState(initial);
  return [w, (e) => setW(Math.max(120, Math.round(e.nativeEvent.layout.width)))];
};

/** Column with a 4 pt rounded top, square at the baseline. */
function columnPath(x: number, w: number, top: number, base: number): string {
  const h = base - top;
  if (h <= 0.5) return '';
  const r = Math.min(4, w / 2, h);
  return `M${x},${base} L${x},${top + r} Q${x},${top} ${x + r},${top} L${x + w - r},${top} Q${x + w},${top} ${x + w},${top + r} L${x + w},${base} Z`;
}

/**
 * Precision meter (SPEC 14.1 "confidence"): the share of the starting uncertainty about the SIZE of an effect that the
 * child's own data has removed. It is not the same as the pattern's status, which says how sure EmoLens is of the direction.
 */
export function ConfidenceMeter({ value, label, compact }: { value: number; label: string; compact?: boolean }) {
  const { c } = useTheme();
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: pct }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <View style={{ flex: 1, height: compact ? 6 : 10, borderRadius: 5, backgroundColor: c.primarySoft, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%`, height: '100%', borderRadius: 5, backgroundColor: c.primary }} />
      </View>
      <T variant="footnote" color="muted" weight="600" style={{ minWidth: 38, textAlign: 'right' }}>{pct}%</T>
    </View>
  );
}

/** A 0..max track with the 80% interval as a wash and the estimate as a dot (strategies, SPEC 9.6). */
export function IntervalBar({ mean, lo, hi, max = 1, label }: { mean: number; lo: number; hi: number; max?: number; label: string }) {
  const { c } = useTheme();
  const [w, onLayout] = useWidth();
  const x = (v: number) => 6 + (Math.max(0, Math.min(max, v)) / max) * (w - 12);
  return (
    <View onLayout={onLayout} accessible accessibilityLabel={label} style={{ height: 18 }}>
      <Svg width={w} height={18}>
        <Line x1={6} x2={w - 6} y1={9} y2={9} stroke={c.border} strokeWidth={4} strokeLinecap="round" />
        <Line x1={x(lo)} x2={x(hi)} y1={9} y2={9} stroke={tint(c.primary, 0.35)} strokeWidth={8} strokeLinecap="round" />
        <Circle cx={x(mean)} cy={9} r={6} fill={c.primary} stroke={c.surface} strokeWidth={2} />
      </Svg>
    </View>
  );
}

export interface RateBar { key: string; label: string; sub?: string; rate: number; lo: number; hi: number; muted?: boolean; }

/**
 * Columns of observed rates with 80% whiskers: "with vs without" on the trigger detail (SPEC 9.5 chart 1) and the
 * time-of-day pattern (9.4). `format` turns a rate into text ("12%"). Also plain counts (the weekly digest's days):
 * a bar with lo === hi has no whisker.
 */
export function RateColumns({ bars, format, summary, height = 170, highlight }: {
  bars: RateBar[]; format: (v: number) => string; summary: string; height?: number; highlight?: string | null;
}) {
  const { c } = useTheme();
  const [w, onLayout] = useWidth();
  const [sel, setSel] = useState<string | null>(null);
  const top = 10, base = height - 4, gutter = 40;
  const maxV = Math.max(0.05, ...bars.map((b) => b.hi)) * 1.1;
  const y = (v: number) => base - (v / maxV) * (base - top);
  const plotW = w - gutter;
  const slot = plotW / Math.max(1, bars.length);
  const bw = Math.min(24, slot * 0.55);
  const ticks = niceTicks(maxV);
  const selected = bars.find((b) => b.key === sel);
  const cxOf = (i: number) => gutter + slot * i + slot / 2;
  return (
    <View accessible accessibilityLabel={summary} style={{ gap: space.xs }}>
      <View onLayout={onLayout}>
        <Svg width={w} height={height}>
          {ticks.map((t) => <Line key={t} x1={gutter} x2={w} y1={y(t)} y2={y(t)} stroke={c.border} strokeWidth={1} />)}
          {bars.map((b, i) => {
            const on = b.key === sel || b.key === highlight;
            const fill = b.muted ? c.learning : c.primary;
            return <Path key={b.key} d={columnPath(cxOf(i) - bw / 2, bw, y(b.rate), base)} fill={on || !sel ? fill : tint(fill, 0.45)} />;
          })}
          {bars.map((b, i) => {
            const cx = cxOf(i);
            if (b.lo === b.hi) return null; // a plain count (digest): no range to show
            return (
              <Path key={`w${b.key}`} d={`M${cx},${y(b.hi)} L${cx},${y(b.lo)} M${cx - 5},${y(b.hi)} L${cx + 5},${y(b.hi)} M${cx - 5},${y(b.lo)} L${cx + 5},${y(b.lo)}`}
                stroke={c.text} strokeWidth={1.5} opacity={0.55} />
            );
          })}
          <Line x1={gutter} x2={w} y1={base} y2={base} stroke={c.textMuted} strokeWidth={1} />
        </Svg>
        {ticks.map((t) => (
          <View key={t} pointerEvents="none" style={{ position: 'absolute', left: 0, top: y(t) - 9, width: gutter - 6 }}>
            <T variant="footnote" color="muted" style={{ textAlign: 'right' }}>{format(t)}</T>
          </View>
        ))}
        {/* tap targets wider than the marks */}
        <View style={{ position: 'absolute', left: gutter, top: 0, width: plotW, height, flexDirection: 'row' }}>
          {bars.map((b) => (
            <Pressable key={b.key} accessibilityRole="button" accessibilityLabel={`${b.label}: ${format(b.rate)}`} onPress={() => setSel(sel === b.key ? null : b.key)}
              style={{ flex: 1 }} />
          ))}
        </View>
      </View>
      <View style={{ flexDirection: 'row', paddingLeft: gutter }}>
        {bars.map((b) => (
          <View key={b.key} style={{ flex: 1, alignItems: 'center' }}>
            <T variant="footnote" color={b.key === sel || b.key === highlight ? 'text' : 'muted'} weight={b.key === sel || b.key === highlight ? '700' : '400'} center numberOfLines={2}>{b.label}</T>
            {b.sub ? <T variant="footnote" color="muted" center numberOfLines={1}>{b.sub}</T> : null}
          </View>
        ))}
      </View>
      {selected ? (
        <View style={{ backgroundColor: c.surfaceAlt, borderRadius: radius.control, padding: space.sm }}>
          <T variant="callout" weight="600">{selected.label}: {format(selected.rate)}</T>
          {selected.lo !== selected.hi ? <T variant="footnote" color="muted">{format(selected.lo)} – {format(selected.hi)}</T> : null}
        </View>
      ) : null}
    </View>
  );
}

/** Up to 5 clean tick values from 0 to about max. */
function niceTicks(max: number): number[] {
  const steps = [0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10];
  const step = steps.find((s) => max / s <= 4) ?? max / 4;
  const out: number[] = [];
  for (let v = step; v <= max + 1e-9; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

export interface EffectPointView { at: number; or: number; orLo: number; orHi: number; }

/**
 * How the estimate changed over time (SPEC 9.5 chart 2): the odds ratio per weekly refit with its 80% band, on a log
 * scale so "2x" and "half" are the same distance from the 1x "no link" line.
 */
export function EffectHistoryChart({ points, summary, format, xLabel }: {
  points: EffectPointView[]; summary: string; format: (or: number) => string; xLabel: (at: number) => string;
}) {
  const { c } = useTheme();
  const [w, onLayout] = useWidth();
  const [sel, setSel] = useState<number | null>(null);
  const height = 170, top = 12, base = height - 8, left = 4, right = 40;
  const lo = Math.min(0.5, ...points.map((p) => p.orLo)), hi = Math.max(2, ...points.map((p) => p.orHi));
  const ly = (v: number) => base - ((Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))) * (base - top);
  const n = points.length;
  const x = (i: number) => left + (n <= 1 ? (w - left - right) / 2 : (i / (n - 1)) * (w - left - right));
  if (!n) return null;
  const band = `${points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${ly(p.orHi)}`).join(' ')} ${[...points].reverse().map((p, j) => `L${x(n - 1 - j)},${ly(p.orLo)}`).join(' ')} Z`;
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${ly(p.or)}`).join(' ');
  const i = sel ?? n - 1;
  const cur = points[i];
  const refs = [0.5, 1, 2, 4].filter((v) => v >= lo && v <= hi);
  return (
    <View accessible accessibilityLabel={summary} style={{ gap: space.xs }}>
      <View onLayout={onLayout}>
        <Svg width={w} height={height}>
          {refs.map((v) => <Line key={v} x1={left} x2={w - right} y1={ly(v)} y2={ly(v)} stroke={v === 1 ? c.textMuted : c.border} strokeWidth={1} />)}
          {n > 1 ? <Path d={band} fill={tint(c.primary, 0.14)} /> : <Line x1={x(0)} x2={x(0)} y1={ly(cur.orHi)} y2={ly(cur.orLo)} stroke={tint(c.primary, 0.4)} strokeWidth={8} strokeLinecap="round" />}
          {n > 1 ? <Path d={line} stroke={c.primary} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" /> : null}
          <Circle cx={x(i)} cy={ly(cur.or)} r={5} fill={c.primary} stroke={c.surface} strokeWidth={2} />
        </Svg>
        {refs.map((v) => (
          <View key={v} pointerEvents="none" style={{ position: 'absolute', right: 0, top: ly(v) - 9, width: right - 4 }}>
            <T variant="footnote" color="muted" style={{ textAlign: 'right' }}>{`${v}×`}</T>
          </View>
        ))}
        <View style={{ position: 'absolute', left: 0, top: 0, width: w - right, height, flexDirection: 'row' }}>
          {points.map((p, k) => (
            <Pressable key={p.at} accessibilityRole="button" accessibilityLabel={`${xLabel(p.at)}: ${format(p.or)}`} onPress={() => setSel(k === sel ? null : k)} style={{ flex: 1 }} />
          ))}
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingRight: right }}>
        <T variant="footnote" color="muted">{xLabel(points[0].at)}</T>
        {n > 1 ? <T variant="footnote" color="muted">{xLabel(points[n - 1].at)}</T> : null}
      </View>
      <T variant="footnote" color="muted">{xLabel(cur.at)}: {format(cur.or)} ({format(cur.orLo)} – {format(cur.orHi)})</T>
    </View>
  );
}

export interface ReliabilityPoint { meanP: number; rate: number; n: number; }

/**
 * Reliability diagram (SPEC 18): each dot is a group of forecasts; across = what EmoLens said, up = how often a hard
 * moment really happened. Dots on the diagonal = honest forecasts.
 */
export function ReliabilityDiagram({ bins, summary, axisSaid, axisHappened }: { bins: ReliabilityPoint[]; summary: string; axisSaid: string; axisHappened: string }) {
  const { c } = useTheme();
  const [w, onLayout] = useWidth();
  const [sel, setSel] = useState<number | null>(null);
  const size = Math.min(w, 260), pad = 10;
  const used = bins.filter((b) => b.n > 0);
  const max = Math.min(1, Math.max(0.2, ...used.map((b) => Math.max(b.meanP, b.rate))) * 1.15);
  const px = (v: number) => pad + (v / max) * (size - 2 * pad);
  const py = (v: number) => size - pad - (v / max) * (size - 2 * pad);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const s = sel != null ? used[sel] : null;
  return (
    <View accessible accessibilityLabel={summary} style={{ gap: space.sm, alignItems: 'center' }} onLayout={onLayout}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
        <View style={{ width: 16, justifyContent: 'center' }}>
          <T variant="footnote" color="muted" style={{ width: 120, transform: [{ rotate: '-90deg' }], position: 'absolute', left: -52, textAlign: 'center' }}>{axisHappened}</T>
        </View>
        <View>
          <Svg width={size} height={size}>
            <Rect x={pad} y={pad} width={size - 2 * pad} height={size - 2 * pad} fill="none" stroke={c.border} strokeWidth={1} />
            <Line x1={px(0)} y1={py(0)} x2={px(max)} y2={py(max)} stroke={c.textMuted} strokeWidth={1} />
            {used.map((b, i) => (
              <Circle key={i} cx={px(b.meanP)} cy={py(b.rate)} r={Math.max(5, Math.min(11, 3 + Math.sqrt(b.n)))} fill={sel == null || sel === i ? c.primary : tint(c.primary, 0.4)} stroke={c.surface} strokeWidth={2} />
            ))}
          </Svg>
          <View style={{ position: 'absolute', left: 0, top: 0, width: size, height: size }}>
            {used.map((b, i) => (
              <Pressable key={i} accessibilityRole="button" accessibilityLabel={`${pct(b.meanP)} → ${pct(b.rate)}`} onPress={() => setSel(sel === i ? null : i)}
                style={{ position: 'absolute', left: px(b.meanP) - 22, top: py(b.rate) - 22, width: 44, height: 44 }} />
            ))}
          </View>
        </View>
      </View>
      <T variant="footnote" color="muted">{axisSaid}</T>
      {s ? <T variant="callout" weight="600">{pct(s.meanP)} → {pct(s.rate)} · n = {s.n}</T> : null}
    </View>
  );
}

/** `count`, not `value`: Reanimated's Babel plugin treats `x.value` inside a style as a shared value. */
export interface Segment { key: string; label: string; count: number; color: string; icon?: ReactNode; }

/** One stacked bar of counts with a legend (alert outcomes, SPEC 15.5). Every segment also has an icon + label. */
export function SegmentBar({ segments, summary }: { segments: Segment[]; summary: string }) {
  const { c } = useTheme();
  const total = segments.reduce((a, s) => a + s.count, 0);
  return (
    <View accessible accessibilityLabel={summary} style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', height: 14, borderRadius: 7, overflow: 'hidden', backgroundColor: c.border, gap: total ? 2 : 0 }}>
        {total ? segments.filter((s) => s.count > 0).map((s) => <View key={s.key} style={{ flex: s.count, backgroundColor: s.color }} />) : null}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
        {segments.map((s) => (
          <View key={s.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {s.icon ?? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: s.color }} />}
            <T variant="footnote" color="muted">{s.label}</T>
            <T variant="footnote" weight="700">{s.count}</T>
          </View>
        ))}
      </View>
    </View>
  );
}
