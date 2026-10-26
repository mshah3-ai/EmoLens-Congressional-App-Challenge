/** The tools' view of the app right now: this phone's database, the child, the settings, the time and language. */
import { currentLang } from '../i18n';
import { useSession } from '../store/session';
import type { ToolEnv } from './tools';

export function toolEnvNow(): ToolEnv | null {
  const { repo, profile, settings } = useSession.getState();
  if (!repo || !profile) return null;
  return { repo, profile, settings, now: Date.now(), lang: currentLang() };
}
