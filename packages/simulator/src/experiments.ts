/** Experiments E1-E6 (spec 26.4), each a set of scenario "arms" run on the same seeds. */
import { withOverrides, type Scenario } from './scenario';

export type ExperimentId = 'E1' | 'E2' | 'E3' | 'E4' | 'E5' | 'E6';
export interface Arm { id: string; label: string; scenario: Scenario; }
export interface Experiment { id: ExperimentId; question: string; arms: Arm[]; }

export const EXPERIMENT_IDS: ExperimentId[] = ['E1', 'E2', 'E3', 'E4', 'E5', 'E6'];
export const E2_INTERVENE_PROBS = [0.3, 0.5, 0.8];
export const E4_LOG_RATES = [1.0, 0.8, 0.6];
export const E4_EOD_RATES = [0.9, 0.6];

/** `base` = the default scenario; `physiology` = the E6 scenario (physiology on, true hr_elevated_pre effect). */
export function buildExperiments(base: Scenario, physiology: Scenario): Experiment[] {
  const arm = (id: string, label: string, s: Scenario): Arm => ({ id, label, scenario: s });
  return [
    { id: 'E1', question: 'How fast does EmoLens learn?', arms: [arm('default', 'Default scenario', base)] },
    {
      id: 'E2', question: 'Does the three-answer confirmation avoid the intervention trap?',
      arms: E2_INTERVENE_PROBS.flatMap((ip) => (['emolens', 'naive'] as const).map((policy) => arm(
        `${policy}_ip${ip}`, `${policy === 'emolens' ? 'EmoLens labels' : 'Naive labels'}, parents step in ${ip * 100}% of the time`,
        withOverrides(base, { labelPolicy: policy, behavior: { interveneProbWhenAlerted: ip } }),
      ))),
    },
    {
      id: 'E3', question: 'Does shrinkage prevent fake patterns?',
      arms: [
        arm('tau_selected', 'Empirical-Bayes tau (EmoLens)', base),
        arm('tau_fixed_1', 'Fixed tau = 1', withOverrides(base, { engine: { tauMode: 1 } })),
        arm('weak_prior', 'Weak prior (trigger sd = 5, tau = 1)', withOverrides(base, { engine: { tauMode: 1, triggerPriorSdOverride: 5 } })),
      ],
    },
    {
      id: 'E4', question: 'How much does logging diligence matter?',
      arms: E4_LOG_RATES.flatMap((lr) => E4_EOD_RATES.map((eod) => arm(
        `log${lr}_eod${eod}`, `Logs ${lr * 100}% of hard moments, end-of-day check ${eod * 100}%`,
        withOverrides(base, { behavior: { logRate: lr, eodCompletion: eod } }),
      ))),
    },
    { id: 'E5', question: 'Can the data overrule a wrong parent belief?', arms: [arm('default', 'Default scenario (parent suspects high_sugar_recent, truly null)', base)] },
    {
      id: 'E6', question: 'Does physiology help?',
      arms: [
        arm('with_physiology', 'Heart-rate data used by the app', physiology),
        arm('without_physiology', 'Same children, heart-rate data not used', withOverrides(physiology, { sources: { physiology: false } })),
      ],
    },
  ];
}
