/**
 * Bug #2 (docs/BUGS.md): typing a birth year digit by digit must work. The field used to throw away every partial
 * year ("2", "20", "201"), so nothing ever appeared.
 */
import { useState } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import type { OnboardingDraft } from '../src/db/repo/onboarding';
import { ChildFields } from '../src/features/ChildFields';
import '../src/i18n';

type Child = OnboardingDraft['child'];
const start: Child = { nickname: 'Sam', birthYear: null, homeTz: 'America/Chicago', communication: null, wakeStart: '07:00', wakeEnd: '20:30', typicalSleepHours: 10 };

/** Holds the draft like the onboarding store does, and records every value handed back. */
function Harness({ initial, seen }: { initial: Child; seen: Child[] }) {
  const [child, setChild] = useState(initial);
  return <ChildFields value={child} onChange={(p) => setChild((c) => { const next = { ...c, ...p }; seen.push(next); return next; })} />;
}

async function type(screen: Awaited<ReturnType<typeof render>>, text: string) {
  const field = screen.getByTestId('child-birth-year');
  for (let i = 1; i <= text.length; i++) await fireEvent.changeText(field, text.slice(0, i));
}

test('each digit shows while typing, and a full valid year is saved', async () => {
  const seen: Child[] = [];
  const screen = await render(<Harness initial={start} seen={seen} />);
  await fireEvent.changeText(screen.getByTestId('child-birth-year'), '2');
  expect(screen.getByTestId('child-birth-year').props.value).toBe('2');
  await type(screen, '2017');
  expect(screen.getByTestId('child-birth-year').props.value).toBe('2017');
  expect(seen[seen.length - 1].birthYear).toBe(2017);
});

test('a partial year is shown but not saved', async () => {
  const seen: Child[] = [];
  const screen = await render(<Harness initial={start} seen={seen} />);
  await type(screen, '201');
  expect(screen.getByTestId('child-birth-year').props.value).toBe('201');
  expect(seen[seen.length - 1].birthYear).toBeNull();
});

test('a 4-digit year out of range is shown, explained, and not saved', async () => {
  const seen: Child[] = [];
  const screen = await render(<Harness initial={start} seen={seen} />);
  await type(screen, '1900');
  expect(screen.getByTestId('child-birth-year').props.value).toBe('1900');
  expect(seen[seen.length - 1].birthYear).toBeNull();
  expect(screen.getByText(/Enter a year between/)).toBeTruthy();
});

test('letters are ignored and clearing the field clears the year', async () => {
  const seen: Child[] = [];
  const screen = await render(<Harness initial={{ ...start, birthYear: 2016 }} seen={seen} />);
  const field = screen.getByTestId('child-birth-year');
  expect(field.props.value).toBe('2016');
  await fireEvent.changeText(field, '20a1');
  expect(screen.getByTestId('child-birth-year').props.value).toBe('201');
  await fireEvent.changeText(screen.getByTestId('child-birth-year'), '');
  expect(screen.getByTestId('child-birth-year').props.value).toBe('');
  expect(seen[seen.length - 1].birthYear).toBeNull();
});
