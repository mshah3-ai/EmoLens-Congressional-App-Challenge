/** Small words under a food: "Sugary · New food". Plain labels only; food is never called a "trigger" (SPEC 14.5). */
import { useTranslation } from 'react-i18next';
import { T } from '../ui/Text';

const SHOWN = ['high_sugar', 'caffeine', 'artificial_color', 'new_food'];

export function FoodTags({ tags }: { tags: string[] }) {
  const { t } = useTranslation();
  const shown = tags.filter((x) => SHOWN.includes(x));
  if (!shown.length) return null;
  return <T variant="footnote" color="muted">{shown.map((x) => t(`meal.tags.${x}`)).join(' · ')}</T>;
}
