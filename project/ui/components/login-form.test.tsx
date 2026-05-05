import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

import { LoginForm } from './login-form';

describe('LoginForm', () => {
  const defaultProps = {
    email: '',
    password: '',
    onEmailChange: vi.fn(),
    onPasswordChange: vi.fn(),
    onSubmit: vi.fn(),
    onSwitchToRegister: vi.fn(),
  };

  it('renders correctly with default props', () => {
    render(<LoginForm {...defaultProps} />);
    
    expect(screen.getByText('Welcome back')).toBeInTheDocument();
    expect(screen.getByText('Login to continue')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument();
    expect(screen.getByText('Sign up')).toBeInTheDocument();
  });

  it('calls onEmailChange when email input changes', async () => {
    const onEmailChange = vi.fn();
    render(<LoginForm {...defaultProps} onEmailChange={onEmailChange} />);
    
    const emailInput = screen.getByLabelText('Email');
    await userEvent.type(emailInput, 'test@example.com');
    
    // userEvent.type fires one onChange per character
    expect(onEmailChange).toHaveBeenCalledTimes(16);
  });

  it('calls onPasswordChange when password input changes', async () => {
    const onPasswordChange = vi.fn();
    render(<LoginForm {...defaultProps} onPasswordChange={onPasswordChange} />);
    
    const passwordInput = screen.getByLabelText('Password');
    await userEvent.type(passwordInput, 'password123');
    
    expect(onPasswordChange).toHaveBeenCalledTimes(11);
  });

  it('calls onSubmit when form is submitted', async () => {
    const onSubmit = vi.fn();
    render(<LoginForm {...defaultProps} onSubmit={onSubmit} />);
    
    const submitButton = screen.getByRole('button', { name: 'Login' });
    const form = submitButton.closest('form')!;
    fireEvent.submit(form);
    
    expect(onSubmit).toHaveBeenCalled();
  });

  it('calls onSwitchToRegister when sign up link is clicked', async () => {
    const onSwitchToRegister = vi.fn();
    render(<LoginForm {...defaultProps} onSwitchToRegister={onSwitchToRegister} />);
    
    const signUpLink = screen.getByText('Sign up');
    await userEvent.click(signUpLink);
    
    expect(onSwitchToRegister).toHaveBeenCalled();
  });

  it('displays error message when provided', () => {
    render(<LoginForm {...defaultProps} error="Invalid credentials" />);
    
    expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
  });

  it('disables inputs and button when pending is true', () => {
    render(<LoginForm {...defaultProps} pending={true} />);
    
    expect(screen.getByLabelText('Email')).toBeDisabled();
    expect(screen.getByLabelText('Password')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Signing in...' })).toBeDisabled();
  });

  it('shows "Signing in..." text when pending is true', () => {
    render(<LoginForm {...defaultProps} pending={true} />);
    
    expect(screen.getByRole('button', { name: 'Signing in...' })).toBeInTheDocument();
  });
});
