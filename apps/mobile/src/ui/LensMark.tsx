/** The EmoLens mark: a soft lens (circle) with a small spark, drawn with SVG so it is sharp at any size. */
import { View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

export function LensMark({ size = 64 }: { size?: number }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} viewBox="0 0 64 64">
        <Defs>
          <LinearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#4A5FD6" />
            <Stop offset="1" stopColor="#7A6BE0" />
          </LinearGradient>
        </Defs>
        <Circle cx="32" cy="32" r="30" fill="url(#g)" />
        <Circle cx="28" cy="30" r="14" fill="none" stroke="#FFFFFF" strokeWidth="4.5" />
        <Path d="M38.5 40.5 L47 49" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" />
        <Path d="M28 22.5 L29.8 27.9 L35.2 29.7 L29.8 31.5 L28 36.9 L26.2 31.5 L20.8 29.7 L26.2 27.9 Z" fill="#FFFFFF" />
      </Svg>
    </View>
  );
}
