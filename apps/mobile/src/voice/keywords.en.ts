/** English words the on-device rule parser looks for (SPEC Appendix B.5 and 20.1). Lowercase; matched as whole words. */
import type { Keywords } from './ruleParser';

export const KEYWORDS_EN: Keywords = {
  meltdown: ['meltdown', 'melted down', 'melt down', 'screaming', 'screamed', 'crying hard', 'cried hard', 'lost it', 'fell apart', 'overwhelmed'],
  shutdown: ['shutdown', 'shut down', 'went quiet', 'stopped talking', 'froze', 'withdrew', 'hid', 'hiding'],
  other: ['upset', 'distressed', 'hard moment', 'rough time'],
  intensity: [
    { words: ['mild', 'small', 'little'], value: 2 },
    { words: ['big', 'bad'], value: 4 },
    { words: ['worst', 'huge', 'massive'], value: 5 },
  ],
  times: [
    { words: ['this morning', 'in the morning'], at: '09:00' },
    { words: ['around noon', 'at noon', 'noon', 'at lunch', 'lunchtime', 'during lunch'], at: '12:00' },
    { words: ['after school'], at: '15:30' },
    { words: ['this afternoon', 'in the afternoon'], at: '15:00' },
    { words: ['this evening', 'at dinner', 'dinnertime', 'tonight'], at: '18:00' },
    { words: ['at bedtime', 'bedtime'], at: '20:00' },
  ],
  yesterday: ['yesterday', 'last night'],
  timeLead: ['at', 'around', 'about'],
  am: ['am', 'a.m.', 'in the morning'],
  pm: ['pm', 'p.m.', 'in the afternoon', 'in the evening'],
  duration: /\b(?:for|lasted|about)\s+(\d{1,3})\s*(?:min|mins|minutes)\b/,
  durationHours: /\b(?:for|lasted|about)\s+(?:an?|one)\s+hour\b/,
  helped: ['helped', 'worked', 'calmed', 'calm down', 'settled'],
  notHelped: ["didn't help", 'did not help', "didn't work", 'did not work'],
  missed: ['missed', 'forgot', "didn't take", 'did not take', 'no medicine'],
  skipped: ['skipped', 'skip'],
  taken: ['took', 'taken', 'gave', 'had his', 'had her', 'had their'],
  meals: [
    { words: ['breakfast'], type: 'breakfast' }, { words: ['lunch'], type: 'lunch' }, { words: ['dinner', 'supper'], type: 'dinner' },
    { words: ['snack'], type: 'snack' }, { words: ['drank', 'drink', 'juice', 'milk'], type: 'drink' },
  ],
  ate: ['ate', 'eat', 'had', 'snack', 'breakfast', 'lunch', 'dinner', 'drank'],
  // Everyday words for the built-in strategies (keyed by their English name in DEFAULT_STRATEGIES): parents say
  // "headphones helped", not "noise-reducing headphones helped". Words that are also foods ("snack", "water") are left out.
  strategyAliases: {
    'Quiet space / break area': ['quiet room', 'quiet corner', 'calm corner', 'calm-down corner', 'break room'],
    'Noise-reducing headphones': ['headphones', 'ear defenders', 'earmuffs', 'ear muffs', 'earplugs'],
    'Dim lights / reduce visual input': ['dimmed the lights', 'turned the lights down', 'turned off the lights', 'lights off'],
    'Deep pressure / weighted item': ['weighted blanket', 'weighted vest', 'weighted lap pad', 'tight hug', 'bear hug'],
    'Comfort object': ['stuffed animal', 'teddy', 'blankie', 'lovey'],
    'Allow stimming / movement': ['stimming', 'stim', 'let him stim', 'let her stim', 'let them stim'],
    'Movement break (walk, swing, jump)': ['walk', 'swing', 'swinging', 'trampoline', 'jumping'],
    'Calm, few words / co-regulation': ['co-regulation', 'coregulation', 'few words', 'calm voice'],
    'Give space and time': ['gave space', 'gave him space', 'gave her space', 'gave them space', 'some space'],
    'Visual schedule / first-then': ['visual schedule', 'first-then', 'first then', 'picture schedule'],
    'Advance warning before a change': ['warning', 'countdown', 'heads-up', 'heads up'],
    'Reduce demands': ['fewer demands', 'reduced demands', 'lowered demands'],
    'Offer choices': ['choices', 'gave a choice', 'offered a choice'],
    'Favorite activity or special interest': ['favorite show', 'special interest', 'favorite toy', 'favorite game'],
    'AAC / communication support': ['aac', 'talker', 'communication device', 'picture cards'],
  },
};
