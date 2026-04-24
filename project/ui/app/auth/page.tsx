'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LoaderCircle } from 'lucide-react';

import { LoginForm } from '@/components/login-form';
import { SignupForm } from '@/components/signup-form';
import { AuthUser } from '@/utils/auth';

export default function AuthPage() {
  const router = useRouter();
  const [authBooting, setAuthBooting] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authPending, setAuthPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/me', { cache: 'no-store' });
        if (response.ok) {
          const payload = (await response.json()) as { user?: AuthUser };
          if (payload.user && !cancelled) {
            // User is already logged in, redirect to chat
            router.push('/chat');
            return;
          }
        }
      } finally {
        if (!cancelled) {
          setAuthBooting(false);
        }
      }
    };
    void checkAuth();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!authEmail.trim() || !authPassword.trim() || (authMode === 'register' && !authName.trim())) {
      setAuthError('Please complete all required fields.');
      return;
    }
    if (authMode === 'register' && authPassword !== authConfirmPassword) {
      setAuthError('Passwords do not match.');
      return;
    }
    setAuthPending(true);
    setAuthError('');
    try {
      const response = await fetch(`/api/auth/${authMode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: authName,
          email: authEmail,
          password: authPassword,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string; user?: AuthUser } | null;
      if (!response.ok || !payload?.user) {
        throw new Error(payload?.error || 'Authentication failed.');
      }
      // Authentication successful, redirect to chat
      router.push('/chat');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Authentication failed.');
      setAuthPending(false);
    }
  };

  if (authBooting) {
    return (
      <main className="flex h-screen w-full items-center justify-center">
        <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Checking session...
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-screen w-full items-center justify-center p-4">
      {authMode === 'login' ? (
        <div className="w-full max-w-md">
          <LoginForm
            email={authEmail}
            password={authPassword}
            pending={authPending}
            error={authError}
            onEmailChange={setAuthEmail}
            onPasswordChange={setAuthPassword}
            onSubmit={handleAuthSubmit}
            onSwitchToRegister={() => {
              setAuthMode('register');
              setAuthError('');
            }}
          />
        </div>
      ) : (
        <SignupForm
          className="w-full max-w-md"
          name={authName}
          email={authEmail}
          password={authPassword}
          confirmPassword={authConfirmPassword}
          pending={authPending}
          error={authError}
          onNameChange={setAuthName}
          onEmailChange={setAuthEmail}
          onPasswordChange={setAuthPassword}
          onConfirmPasswordChange={setAuthConfirmPassword}
          onSubmit={handleAuthSubmit}
          onSwitchToLogin={() => {
            setAuthMode('login');
            setAuthError('');
          }}
        />
      )}
    </main>
  );
}
