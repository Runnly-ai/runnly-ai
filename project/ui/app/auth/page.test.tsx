import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import AuthPage from './page';

// Mock the components
vi.mock('@/components/login-form', () => ({
  LoginForm: ({ 
    email, 
    password, 
    pending, 
    error, 
    onEmailChange, 
    onPasswordChange, 
    onSubmit, 
    onSwitchToRegister 
  }: any) => (
    <div data-testid="login-form">
      <input 
        data-testid="email-input"
        value={email}
        onChange={(e) => onEmailChange(e.target.value)}
        disabled={pending}
      />
      <input 
        data-testid="password-input"
        type="password"
        value={password}
        onChange={(e) => onPasswordChange(e.target.value)}
        disabled={pending}
      />
      {error && <div data-testid="error-message">{error}</div>}
      <button 
        data-testid="submit-button"
        onClick={onSubmit}
        disabled={pending}
      >
        {pending ? 'Signing in...' : 'Login'}
      </button>
      <button 
        data-testid="switch-to-register"
        onClick={onSwitchToRegister}
      >
        Sign up
      </button>
    </div>
  ),
}));

vi.mock('@/components/signup-form', () => ({
  SignupForm: ({ 
    name,
    email, 
    password, 
    confirmPassword,
    pending, 
    error, 
    onNameChange,
    onEmailChange, 
    onPasswordChange,
    onConfirmPasswordChange,
    onSubmit, 
    onSwitchToLogin 
  }: any) => (
    <div data-testid="signup-form">
      <input 
        data-testid="name-input"
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        disabled={pending}
      />
      <input 
        data-testid="email-input"
        value={email}
        onChange={(e) => onEmailChange(e.target.value)}
        disabled={pending}
      />
      <input 
        data-testid="password-input"
        type="password"
        value={password}
        onChange={(e) => onPasswordChange(e.target.value)}
        disabled={pending}
      />
      <input 
        data-testid="confirm-password-input"
        type="password"
        value={confirmPassword}
        onChange={(e) => onConfirmPasswordChange(e.target.value)}
        disabled={pending}
      />
      {error && <div data-testid="error-message">{error}</div>}
      <button 
        data-testid="submit-button"
        onClick={onSubmit}
        disabled={pending}
      >
        {pending ? 'Creating account...' : 'Create Account'}
      </button>
      <button 
        data-testid="switch-to-login"
        onClick={onSwitchToLogin}
      >
        Sign in
      </button>
    </div>
  ),
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('AuthPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock successful auth check (not logged in)
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ user: null }),
    });
  });

  it('renders loading state initially', () => {
    render(<AuthPage />);
    expect(screen.getByText('Checking session...')).toBeInTheDocument();
  });

  it('renders login form after auth check completes', async () => {
    render(<AuthPage />);
    
    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByText('Checking session...')).not.toBeInTheDocument();
    });
    
    expect(screen.getByTestId('login-form')).toBeInTheDocument();
  });

  it('redirects to /chat if user is already authenticated', async () => {
    // Mock authenticated user
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ 
        user: { 
          id: '1', 
          email: 'test@example.com', 
          name: 'Test User', 
          createdAt: Date.now(), 
          updatedAt: Date.now() 
        } 
      }),
    });

    const mockRouterPush = vi.fn();
    vi.mocked(useRouter).mockReturnValue({
      push: mockRouterPush,
      replace: vi.fn(),
      refresh: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
    } as any);

    render(<AuthPage />);
    
    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith('/chat');
    });
  });

  it('switches to signup form when switch button is clicked', async () => {
    render(<AuthPage />);
    
    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByText('Checking session...')).not.toBeInTheDocument();
    });
    
    // Click switch to register
    await userEvent.click(screen.getByTestId('switch-to-register'));
    
    expect(screen.getByTestId('signup-form')).toBeInTheDocument();
  });

  it('switches back to login form from signup form', async () => {
    render(<AuthPage />);
    
    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByText('Checking session...')).not.toBeInTheDocument();
    });
    
    // Switch to signup
    await userEvent.click(screen.getByTestId('switch-to-register'));
    expect(screen.getByTestId('signup-form')).toBeInTheDocument();
    
    // Switch back to login
    await userEvent.click(screen.getByTestId('switch-to-login'));
    expect(screen.getByTestId('login-form')).toBeInTheDocument();
  });

  it('shows error for incomplete login fields', async () => {
    render(<AuthPage />);
    
    await waitFor(() => {
      expect(screen.queryByText('Checking session...')).not.toBeInTheDocument();
    });
    
    // Submit with empty fields
    await userEvent.click(screen.getByTestId('submit-button'));
    
    expect(screen.getByTestId('error-message')).toHaveTextContent('Please complete all required fields.');
  });

  it('shows error for password mismatch in signup', async () => {
    render(<AuthPage />);
    
    await waitFor(() => {
      expect(screen.queryByText('Checking session...')).not.toBeInTheDocument();
    });
    
    // Switch to signup
    await userEvent.click(screen.getByTestId('switch-to-register'));
    
    // Fill in fields with mismatched passwords
    await userEvent.type(screen.getByTestId('name-input'), 'Test User');
    await userEvent.type(screen.getByTestId('email-input'), 'test@example.com');
    await userEvent.type(screen.getByTestId('password-input'), 'password123');
    await userEvent.type(screen.getByTestId('confirm-password-input'), 'different123');
    
    // Submit
    await userEvent.click(screen.getByTestId('submit-button'));
    
    expect(screen.getByTestId('error-message')).toHaveTextContent('Passwords do not match.');
  });
});