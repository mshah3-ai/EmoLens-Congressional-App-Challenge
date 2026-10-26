/** Calls `fn` whenever the app comes back to the foreground (e.g. after the parent changed a permission in Settings). */
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

export function useOnAppActive(fn: () => void): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    let last = AppState.currentState;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && last !== 'active') ref.current();
      last = next;
    });
    return () => sub.remove();
  }, []);
}
