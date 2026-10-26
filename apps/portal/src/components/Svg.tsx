/**
 * Shows a chart made by the shared report code (@emolens/reports svg.ts). Those charts escape every label, so the SVG
 * text is safe to insert; the page's Content-Security-Policy blocks scripts in any case.
 */
export function Svg({ svg, label }: { svg: string; label: string }) {
  return <div role="img" aria-label={label} className="overflow-x-auto [&_svg]:h-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} />;
}
