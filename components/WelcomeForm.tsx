'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { loadSession, saveSession, UserSession } from '@/lib/session';
import { getLocationWithAddress } from '@/lib/geolocation';
import { useRouter } from 'next/navigation';

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function WelcomeForm() {
  const router = useRouter();
  const existing = useMemo(() => loadSession(), []);
  const nameId = useId();
  const emailId = useId();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (existing) {
      router.replace('/chat');
    }
  }, [existing, router]);

  const disabled = !name.trim() || name.trim().length < 2 || !validateEmail(email) || submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (disabled) return;
    setSubmitting(true);
    const location = await getLocationWithAddress(email);
    const session: UserSession = {
      name: name.trim(),
      email: email.trim(),
      createdAt: Date.now(),
      location: location ?? undefined
    };
    saveSession(session);
    router.replace('/chat');
  }

  return (
    <div className="w-full max-w-xl mx-auto">
      <div className="text-center mb-6">
        <h1 className="text-2xl md:text-3xl font-semibold">Welcome</h1>
      </div>

      <form onSubmit={handleSubmit} className="card p-5 md:p-6 space-y-5">
        <div className="space-y-2">
          <label className="text-xs text-white/70" htmlFor={nameId}>Full name</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/50">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M12 12c2.761 0 5-2.239 5-5s-2.239-5-5-5-5 2.239-5 5 2.239 5 5 5Z" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M21 22a9 9 0 1 0-18 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </span>
            <input
              id={nameId}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., John Doe"
              autoFocus
              autoComplete="name"
              className="w-full rounded-xl bg-[#141415] border border-white/10 pl-11 pr-4 py-3 outline-none focus:ring-2 focus:ring-primary/40 caret-primary text-[15px] leading-6"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-white/70" htmlFor={emailId}>Email</label>
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/50">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M3 7.5a2.5 2.5 0 0 1 2.5-2.5h13A2.5 2.5 0 0 1 21 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5v-9Z" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M4 7l8 6 8-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
            <input
              id={emailId}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@domain.com"
              autoComplete="email"
              className="w-full rounded-xl bg-[#141415] border border-white/10 pl-11 pr-4 py-3 outline-none focus:ring-2 focus:ring-accent/40 caret-accent text-[15px] leading-6"
              aria-invalid={!!email && !validateEmail(email)}
            />
          </div>
          {email && !validateEmail(email) && <p className="text-xs text-red-400">Please enter a valid email address.</p>}
        </div>

        <button
          type="submit"
          disabled={disabled}
          className="w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-all bg-gradient-to-tr from-primary to-accent hover:brightness-110 shadow-[0_10px_25px_rgba(233,66,108,0.25)]"
        >
          {submitting ? 'Saving…' : 'Start chat'}
        </button>

        <p className="text-xs text-white/60 text-center">We will collect your location.</p>
      </form>
 
    </div>
  );
}



