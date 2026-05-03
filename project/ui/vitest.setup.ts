import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';

// Run cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
}));

// Mock lucide-react
vi.mock('lucide-react', async () => {
  const actual = await vi.importActual('lucide-react');
  return {
    ...actual,
    LoaderCircle: ({ className }: { className?: string }) => (
      <svg className={className} data-testid="loader-circle" />
    ),
  };
});