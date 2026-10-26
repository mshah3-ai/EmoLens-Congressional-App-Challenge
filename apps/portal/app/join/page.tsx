import { JoinForm } from './JoinForm';

export default function Join() {
  return (
    <div className="mx-auto max-w-md space-y-4 rounded-2xl border border-line bg-surface p-6">
      <h1 className="text-2xl font-semibold">Join a child&apos;s care team</h1>
      <p className="text-sm text-muted">Type the 8-character code the family sent you. It works once, for 7 days.</p>
      <JoinForm />
    </div>
  );
}
