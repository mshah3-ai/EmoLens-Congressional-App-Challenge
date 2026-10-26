/** Shows AI text with its light formatting (bold, lists, headings) instead of Markdown symbols (src/lib/markdown.ts). */
import { View } from 'react-native';
import { parseMarkdown, type Span } from '../lib/markdown';
import { T, type TProps } from './Text';
import { space } from './theme';

function Spans({ spans, variant, color }: { spans: Span[]; variant: TProps['variant']; color: TProps['color'] }) {
  return <>{spans.map((s, i) => (s.bold ? <T key={i} variant={variant} color={color} weight="700">{s.text}</T> : s.text))}</>;
}

export function RichText({ text, variant = 'body', color = 'text', selectable, testID }:
  { text: string; variant?: TProps['variant']; color?: TProps['color']; selectable?: boolean; testID?: string }) {
  return (
    <View testID={testID} style={{ gap: space.xs }}>
      {parseMarkdown(text).map((b, i) => b.kind === 'bullet' ? (
        <View key={i} style={{ flexDirection: 'row', gap: space.xs, paddingLeft: space.xs }}>
          <T variant={variant} color={color}>{b.marker}</T>
          <T variant={variant} color={color} selectable={selectable} style={{ flex: 1 }}><Spans spans={b.spans} variant={variant} color={color} /></T>
        </View>
      ) : (
        <T key={i} variant={variant} color={color} selectable={selectable} weight={b.kind === 'heading' ? '700' : undefined}
          style={i > 0 && b.kind === 'heading' ? { marginTop: space.xs } : undefined}>
          <Spans spans={b.spans} variant={variant} color={color} />
        </T>
      ))}
    </View>
  );
}
