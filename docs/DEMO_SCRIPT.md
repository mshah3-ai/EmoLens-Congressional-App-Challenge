# Demo video script (about 3½ minutes)

Everything is shown in **demo mode** (More → Demo mode): a made-up child, "Sam", with about 120 simulated days, and
a "DEMO DATA: not a real child" banner on every screen. No real child's data appears in the video.

## Before recording (checklist)
1. **Sign in first, outside demo mode** (More → Account), because accounts can't be opened inside demo mode. You need
   this only for the Ask EmoLens part. Use the local Supabase with the AI key (HUMAN_TODO Phase 8 B), or production
   once Phase 8 is deployed.
2. More → Demo mode → **Turn on demo**. If the demo is older than today, tap **Regenerate demo data** so it ends today.
3. In demo mode, More → AI features → turn on (it sends only made-up demo data).
4. Phone: Do Not Disturb on, full battery icon, text size normal, light mode (do a second take in dark mode or
   Spanish if time allows). Record with the iOS Simulator (File → Record Screen) or the phone's screen recorder.
5. Have the portal open in a browser at the clinician's child page (optional segment 9), signed in as a clinician
   test account.
6. Rehearse once with a timer. Speak slowly; leave a one-second pause after each tap.

## Script
| # | Time | Screen and what to tap | What to say |
|---|---|---|---|
| 1 | 0:00-0:20 | Title card, then Today | "Families of autistic kids often say hard moments come out of nowhere. Usually they don't: short sleep, a busy day, a noisy room. But nobody can track all of that in their head. I built EmoLens to help." |
| 2 | 0:20-0:45 | **Today**: the header, "Today's outlook", the day strip. Tap one block | "This is Sam's day, in 2-hour blocks. EmoLens gives each block a chance of a hard moment, with a range and the reasons, like 'short sleep last night'. It always pairs a color with an icon and a word, so it works for color-blind users and screen readers." |
| 3 | 0:45-1:05 | Tap **+** → **Hard moment** → pick a type → **Save** | "Logging takes two taps, because in the middle of a meltdown nobody has time for a form. Details like what happened before and what helped can wait until later." |
| 4 | 1:05-1:15 | **Timeline** | "Everything for the day in one place: hard moments, meals, sleep, medications, place arrivals." |
| 5 | 1:15-1:50 | **Insights** → tap a pattern (e.g. Short sleep) | "After a few weeks, EmoLens shows patterns. It uses a Bayesian model fitted for each child on the phone. It starts out skeptical and only says 'likely linked' when the evidence is strong, and it shows that evidence. Parents can also mark a trigger they suspect, and EmoLens checks it instead of just agreeing." |
| 6 | 1:50-2:05 | Insights → **Model Health** | "EmoLens also grades itself: how its forecasts compared with what really happened. I tested the same code on 3,200 simulated families where I knew the true triggers: it found 84% of them by day 90 and 89% by day 120, while calling a fake pattern 'likely' on at most 4% of days. It missed one of my own targets, and my validation report explains why, honestly." |
| 7 | 2:05-2:25 | More → **Weekly digests** → open the latest | "Every week there's a short digest: how the week went, what changed, what helped." |
| 8 | 2:25-2:50 | Today → **Ask EmoLens** bar → ask "What happened on the days with the most hard moments?" | "With AI turned on, a parent can ask questions in plain words. The AI's tools run on the phone, and it never sees Sam's name, locations, audio or photos." |
| 9 | 2:50-3:10 | More → **Reports** → audience **School** (show the "Only school time" switch) → **PDF report** → scroll the PDF | "Reports for a clinician, a school or the family. A school report leaves out medications, sleep, health and places, and only includes school hours, so it never reveals home life." *(Optional: show the clinician portal in the browser for 5 seconds.)* |
| 10 | 3:10-3:30 | More → **Privacy & security**, then More → **AI disclosure** | "Everything is encrypted on the phone and nothing leaves unless the family chooses. EmoLens works in English and Spanish. I wrote the app's code and used AI to help debug it. The optional chatbot uses Claude's API. EmoLens is meant to support autistic kids, not change who they are." |

## Optional segments (if there is time, or for a longer cut)
- **Care Team invite preview:** Care Team isn't available in demo mode, so record this on a real (non-demo) profile
  with no real child data: Team → Invite → tap Teacher and show "What they'll never see".
- **Spanish:** More → Language → Español, then show Today and Insights (5 seconds).
- **Voice note:** + → Voice note → "Meltdown at 4 PM, headphones helped" → the review screen (iPhone only).

## Citations to show on screen (read the papers first)
- Goodwin et al., *Autism Research* 12:1286-1296 (2019): wearable sensors predicted aggression 1 minute ahead.
- Goodwin and colleagues, *JAMA Network Open* (2023): 3 minutes ahead, logistic regression worked best.
- Say: "Their work predicts minutes ahead from body signals. EmoLens adds hours-ahead planning from daily context."

## Don'ts
- Don't show a real child, real names, real places or the real (non-demo) profile's data.
- Don't say EmoLens diagnoses, treats or predicts with certainty: say "chance", "pattern", "possible link".
- Don't use the words "tantrum", "bad behavior" or "fix" (see SPEC Section 1).
