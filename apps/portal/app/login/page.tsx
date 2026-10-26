import { LoginForm } from './LoginForm';

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <div className="mx-auto max-w-md space-y-4 rounded-2xl border border-line bg-surface p-6">
      <h1 className="text-2xl font-semibold">Sign in to the EmoLens portal</h1>
      <p className="text-sm text-muted">For a child&apos;s care team: clinicians, teachers and family members who were invited with a code.</p>
      {error ? <p role="alert" className="text-sm text-high">That sign-in link didn&apos;t work or has expired. Send a new one.</p> : null}
      <LoginForm next={next ?? '/children'} />
    </div>
  );
}
