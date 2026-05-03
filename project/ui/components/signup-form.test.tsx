import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

import { SignupForm } from './signup-form';

describe('SignupForm', () => {
  const defaultProps = {
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    onNameChange: vi.fn(),
    onEmailChange: vi.fn(),
    onPasswordChange: vi.fn(),
    onConfirmPasswordChange: vi.fn(),
    onSubmit: vi.fn(),
    onSwitchToLogin: vi.fn(),
  };

  it('renders correctly with default props', () => {
    render(<SignupForm {...defaultProps} />);
    
    expect(screen.getByText('Create your account')).toBeInTheDocument();
    expect(screen.getByText('Enter your email below to create your account')).toBeInTheDocument();
    expect(screen.getByLabelText('Full Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Account' })).toBeInTheDocument();
    expect(screen.getByText('Sign in')).toBeInTheDocument();
  });

  it('calls onNameChange when name input changes', async () => {
    const onNameChange = vi.fn();
    render(<SignupForm {...defaultProps} onNameChange={onNameChange} />);
    
    const nameInput = screen.getByLabelText('Full Name');
    await userEvent.type(nameInput, 'John Doe');
    
    expect(onNameChange).toHaveBeenCalledWith('John Doe');
  });

  it('calls onEmailChange when email input changes', async () => {
    const onEmailChange = vi.fn();
    render(<SignupForm {...defaultProps} onEmailChange={onEmailChange} />);
    
    const emailInput = screen.getByLabelText('Email');
    await userEvent.type(emailInput, 'test@example.com');
    
    expect(onEmailChange).toHaveBeenCalledWith('test@example.com');
  });

  it('calls onPasswordChange when password input changes', async () => {
    const onPasswordChange = vi.fn();
    render(<SignupForm {...defaultProps} onPasswordChange={onPasswordChange} />);
    
    const passwordInput = screen.getByLabelText('Password');
    await userEvent.type(passwordInput, 'password123');
    
    expect(onPasswordChange).toHaveBeenCalledWith('password123');
  });

  it('calls onConfirmPasswordChange when confirm password input changes', async () => {
    const onConfirmPasswordChange = vi.fn();
    render(<SignupForm {...defaultProps} onConfirmPasswordChange={onConfirmPasswordChange} />);
    
    const confirmPasswordInput = screen.getByLabelText('Confirm Password');
    await userEvent.type(confirmPasswordInput, 'password123');
    
    expect(onConfirmPasswordChange).toHaveBeenCalledWith('password123');
  });

  it('calls onSubmit when form is submitted', async () => {
    const onSubmit = vi.fn((e) => e.preventDefault());
    render(<SignupForm {...defaultProps} onSubmit={onSubmit} />);
    
    const submitButton = screen.getByRole('button', { name: 'Create Account' });
    await userEvent.click(submitButton);
    
    expect(onSubmit).toHaveBeenCalled();
  });

  it('calls onSwitchToLogin when sign in link is clicked', async () => {
    const onSwitchToLogin = vi.fn();
    render(<SignupForm {...defaultProps} onSwitchToLogin={onSwitchToLogin} />);
    
    const signInLink = screen.getByText('Sign in');
    await userEvent.click(signInLink);
    
    expect(onSwitchToLogin).toHaveBeenCalled();
  });

  it('displays error message when provided', () => {
    render(<SignupForm {...defaultProps} error="Email already exists" />);
    
    expect(screen.getByText('Email already exists')).toBeInTheDocument();
  });

  it('disables inputs and button when pending is true', () => {
    render(<SignupForm {...defaultProps} pending={true} />);
    
    expect(screen.getByLabelText('Full Name')).toBeDisabled();
    expect(screen.getByLabelText('Email')).toBeDisabled();
    expect(screen.getByLabelText('Password')).toBeDisabled();
    expect(screen.getByLabelText('Confirm Password')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Creating account...' })).toBeDisabled();
  });

  it('shows "Creating account..." text when pending is true', () => {
    render(<SignupForm {...defaultProps} pending={true} />);
    
    expect(screen.getByRole('button', { name: 'Creating account...' })).toBeInTheDocument();
  });

  it('renders terms and privacy policy links', () => {
    render(<SignupForm {...defaultProps} />);
    
    expect(screen.getByText('Terms of Service')).toBeInTheDocument();
    expect(screen.getByText('Privacy Policy')).toBeInTheDocument();
  });
});