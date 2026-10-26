# Consent form and child assent script (template)

> For the competition prototype, testing is limited to the student's own family, with this form signed first
> (SPEC 27.3). Any study beyond the family (for example a science fair) must follow that event's human-subjects review
> process, and the form must be reviewed by that process. This is not legal advice.

## Part A: Parent/guardian consent (plain language)

### What this project is
EmoLens is a phone app I am building for the Congressional App Challenge. It helps a family notice what tends to come
before an autistic child's hard moments (meltdowns or shutdowns), such as short sleep, a busy day, or a loud place.
It shows patterns and a daily outlook. It is **not** a medical device and does not diagnose or treat anything.
It is built to support your child, not to change who they are.

### What we will ask you to do
- Use EmoLens on your own phone for about **[number] weeks**: log hard moments when they happen (about 10 seconds
  each), and answer a short end-of-day check ("was the rest of the day calm?").
- If you want, connect optional sources: Apple Health or Health Connect (sleep, heart rate), location (to know when
  your child is at home or school), your calendar, and the microphone for a short sound check.
- If you want, invite another caregiver, a teacher or a clinician, and try the optional AI features.
- Tell me what was confusing or didn't work. You can skip any part.

### What information is collected and where it is kept
- Everything stays **on your phone**, in an encrypted database, unless you turn on Care Team or AI features.
- With Care Team on, a copy of what your team needs is stored with Supabase (a cloud database company). Each person
  sees only what their role allows; teachers never see medications, sleep, health or home places.
- With AI features on, questions and log entries needed to answer them go to Anthropic (an AI company) through
  EmoLens's server, with your child's nickname replaced by "[CHILD]". Locations, audio and photos are never sent.
- Never collected: your child's full name or photos. Map locations, calendar events, heart-rate readings and sound
  checks never leave your phone. Sound checks keep only a loudness number; the audio is deleted at once.
- I (the student) will see only what you choose to show me or share with me. Anything I use in my project
  presentation will be **made-up demo data** or numbers you have approved, with nothing that identifies your child.
- Full details: `docs/PRIVACY_POLICY.md`.

### Risks and benefits
- **Possible risks:** logging can take a little time, and seeing patterns about hard moments can feel stressful. If
  your phone is unlocked and someone else uses it, they could see what you logged (you can turn on the app lock). Any
  app can have bugs: the outlook can be wrong, so never rely on it for safety. If anyone is in danger, call 911.
- **Possible benefits:** you may notice patterns you hadn't seen, and have clearer notes to share with your child's
  care team. There may be no benefit at all; the app is a prototype.
- No payment is offered, and there is no cost.

### Your choices
- Taking part is **voluntary**. You can stop at any time, for any reason, without explaining.
- You can delete everything at any time: **More → Privacy & security → Delete all data** on the phone, and **More →
  Account → Delete account** for anything in the cloud.
- Saying no or stopping will not affect anything else between us.
- Questions? Ask me at any time: **[student's name and how to reach them]**.

### Signatures
I have read this form (or had it read to me), my questions were answered, and I agree to take part.

Parent/guardian name: ______________________  Signature: ______________________  Date: __________

Student name: ______________________  Signature: ______________________  Date: __________

## Part B: Child assent script
Adapt the words to how the child communicates best: spoken, with pictures or visual supports, with their AAC device,
or with a trusted adult explaining. Keep it short, calm and pressure-free. Use the child's words for feelings.

> "I made an app for grown-ups. It helps them notice what makes days hard for you, like being tired or a noisy room,
> so they can help make things easier. Your grown-up will write down when something is hard. The app doesn't record
> your voice or take pictures of you.
> Is it OK if your grown-up uses it? You can say yes, no, or 'not now'. You can change your mind any time, and nobody
> will be upset."

- With pictures or AAC: show a "yes", "no" and "not now" choice; wait without hurrying.
- **The child's "no", "stop", or signs of discomfort (turning away, distress, leaving) are respected** at any time,
  even after the parent has agreed. Ask again only later, and only if the child seems comfortable.
- Write down how the child answered: ______________________  Date: __________
