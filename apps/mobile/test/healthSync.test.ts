/**
 * Bug found in the iOS Simulator: Apple Health was "on" but nothing was imported.
 *  1. A sleep entry added by hand in the Health app is "In Bed" (value 0); EmoLens ignored it, so no night appeared.
 *  2. Turning the source on skipped the permission request whenever iOS answered "unnecessary", which it also does
 *     after a refusal, so a refused parent never saw the screen again and the card said "Connected".
 * This replays the exact Simulator data through the real sync (Apple Health's library is replaced by a stand-in).
 */
import * as HK from '@kingstinct/react-native-healthkit';
import { completeOnboarding } from '../src/db/repo/onboarding';
import { freshDraft } from '../src/store/onboarding';
import { useSession } from '../src/store/session';
import { healthIntegration } from '../src/integrations/health';
import { setIntegrationEnabled } from '../src/integrations/enable';
import { patchIntegrationState, getIntegrationState } from '../src/integrations/state';
import { runRefresh } from '../src/integrations/refresh';
import { testRepo } from './nodeDb';

const hk = HK as jest.Mocked<typeof HK>;
const at = (s: string) => new Date(`${s}-05:00`);

async function session() {
  const repo = await testRepo();
  await completeOnboarding(repo, { ...freshDraft(), child: { ...freshDraft().child, nickname: 'Sam', homeTz: 'America/Chicago' } });
  await useSession.getState().useRepoForTests(repo);
  return repo;
}

beforeEach(() => jest.clearAllMocks());

test('the Simulator data (one "In Bed" sleep entry + one heart-rate reading) imports 1 night and 1 reading', async () => {
  const repo = await session();
  const profile = useSession.getState().profile!;
  (hk.isHealthDataAvailable as jest.Mock).mockReturnValue(true);
  (hk.getRequestStatusForAuthorization as jest.Mock).mockResolvedValue(2);
  (hk.queryCategorySamples as jest.Mock).mockResolvedValue([{ value: 0, startDate: at('2026-09-28T21:30:00'), endDate: at('2026-09-29T06:45:00') }]);
  (hk.queryQuantitySamples as jest.Mock).mockImplementation(async (id: string) => (id === 'HKQuantityTypeIdentifierHeartRate'
    ? [{ uuid: 'hr-1', startDate: at('2026-09-29T11:25:00'), endDate: at('2026-09-29T11:25:00'), quantity: 90 }] : []));
  await patchIntegrationState(repo.db, 'health', { enabled: true });

  const report = await runRefresh({ repo, profile, now: at('2026-09-29T13:30:00').getTime() }, [healthIntegration]);
  expect(report.ran).toEqual(['health']);
  expect(report.imported.health).toMatchObject({ summary: { nights: 1, heart_rate: 1 }, foundData: true });
  const sleep = (await repo.db.execute('SELECT sleep_start, sleep_end, duration_min, night_wakings, source FROM sleep_entries')).rows;
  expect(sleep).toEqual([{ sleep_start: '2026-09-29T02:30:00.000Z', sleep_end: '2026-09-29T11:45:00.000Z', duration_min: 555, night_wakings: null, source: 'healthkit' }]);

  const again = await runRefresh({ repo, profile, now: at('2026-09-29T13:31:00').getTime() }, [healthIntegration], { force: true });
  expect(again.imported.health?.summary).toEqual({}); // nothing new the second time
});

test('Health returning nothing at all is reported, not shown as "Connected"', async () => {
  const repo = await session();
  const profile = useSession.getState().profile!;
  (hk.isHealthDataAvailable as jest.Mock).mockReturnValue(true);
  (hk.getRequestStatusForAuthorization as jest.Mock).mockResolvedValue(2);
  (hk.queryCategorySamples as jest.Mock).mockResolvedValue([]);
  (hk.queryQuantitySamples as jest.Mock).mockResolvedValue([]);
  await patchIntegrationState(repo.db, 'health', { enabled: true });
  await runRefresh({ repo, profile, now: Date.now() }, [healthIntegration]);
  expect((await getIntegrationState(repo.db, 'health')).lastFoundData).toBe(false);
});

test('switching Apple Health on always makes the permission request, even when iOS says "unnecessary"', async () => {
  await session();
  (hk.isHealthDataAvailable as jest.Mock).mockReturnValue(true);
  (hk.getRequestStatusForAuthorization as jest.Mock).mockResolvedValue(2); // what iOS answered in the Simulator
  (hk.requestAuthorization as jest.Mock).mockResolvedValue(true);
  const r = await setIntegrationEnabled('health', true);
  expect(hk.requestAuthorization).toHaveBeenCalledWith({ toRead: expect.arrayContaining(['HKCategoryTypeIdentifierSleepAnalysis', 'HKQuantityTypeIdentifierHeartRate']) });
  expect(r.state).toBe('on');
});
