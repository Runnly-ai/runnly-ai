'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LoaderCircle } from 'lucide-react';

import { AuthUser } from '@/utils/auth';

export default function HomePage() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/me', { cache: 'no-store' });
        if (!cancelled) {
          if (response.ok) {
            const payload = (await response.json()) as { user?: AuthUser };
            if (payload.user) {
              router.push('/chat');
              return;
            }
          }
          router.push('/auth');
        }
      } catch {
        if (!cancelled) {
          router.push('/auth');
        }
      } finally {
        if (!cancelled) {
          setIsChecking(false);
        }
      }
    };
    void checkAuth();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="flex h-screen w-full items-center justify-center">
      <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="h-4 w-4 animate-spin" />
        {isChecking ? 'Checking authentication...' : 'Redirecting...'}
      </div>
    </main>
  );
}
