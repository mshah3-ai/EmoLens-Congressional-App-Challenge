'use client';
import { useActionState } from 'react';
import { sendLink, verifyCode, type LoginState } from './actions';

const input = 'w-full rounded-lg border border-line bg-surface px-3 py-2';
const button = 'rounded-lg bg-primary px-4 py-2 font-semibold text-white disabled:opacity-50';

export function LoginForm({ next }: { next: string }) {
  const [state, send, sending] = useActionState<LoginState, FormData>(sendLink, { step: 'email', email: '', error: null });
  const [codeState, verify, verifying] = useActionState<LoginState, FormData>(
    (prev, form) => verifyCode({ ...prev, email: state.email }, form), { step: 'code', email: '', error: null });
  return (
    <div className="space-y-6">
      <form action={send} className="space-y-3" data-testid="login-email-form">
        <input type="hidden" name="next" value={next} />
        <label className="block text-sm font-semibold" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.email} className={input} />
        <button className={button} disabled={sending} type="submit">{sending ? 'Sending…' : 'Email me a sign-in link'}</button>
        {state.error ? <p role="alert" className="text-sm text-high">{state.error}</p> : null}
      </form>
      {state.step === 'code' ? (
        <form action={verify} className="space-y-3" data-testid="login-code-form">
          <p className="text-sm" role="status">We emailed a link and a 6-digit code to {state.email}. Open the link, or type the code here.</p>
          <input type="hidden" name="next" value={next} />
          <label className="block text-sm font-semibold" htmlFor="code">6-digit code</label>
          <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required className={input} />
          <button className={button} disabled={verifying} type="submit">Sign in</button>
          {codeState.error ? <p role="alert" className="text-sm text-high">{codeState.error}</p> : null}
        </form>
      ) : null}
    </div>
  );
}
