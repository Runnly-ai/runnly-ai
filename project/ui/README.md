# Runnly.AI UI

Standalone frontend package for Runnly.AI.

## Unit Test Coverage

Unit tests are written using [Vitest](https://vitest.dev/), [React Testing Library](https://testing-library.com/react), and `@testing-library/user-event`. The test infrastructure is configured via:

- **`vitest.config.ts`** — Vitest configuration with jsdom environment, React plugin, and path aliases.
- **`vitest.setup.ts`** — Test setup that imports jest-dom matchers, registers `afterEach` cleanup, and provides mocks for `next/navigation` and `lucide-react`.
- **`test-utils.tsx`** — Custom render utility wrapping React Testing Library's `render`.

### Currently Covered Components

| Component | File | Tests |
|-----------|------|-------|
| **LoginForm** | `components/login-form.test.tsx` | Rendering, email/password input changes, form submission, switch-to-register link, error display, disabled/pending states |
| **SignupForm** | `components/signup-form.test.tsx` | Rendering, name/email/password/confirm-password input changes, form submission, switch-to-login link, error display, disabled/pending states, terms/privacy links |

### What Each Test Covers

#### LoginForm (`components/login-form.test.tsx`)
- Renders "Welcome back" title, "Login to continue" description, email/password inputs, Login button, and "Sign up" link
- Fires `onEmailChange` callback on email input
- Fires `onPasswordChange` callback on password input
- Fires `onSubmit` callback on form submission
- Fires `onSwitchToRegister` callback on clicking "Sign up"
- Displays error message when `error` prop is provided
- Disables all inputs and button when `pending` is `true`
- Shows "Signing in..." button text when pending

#### SignupForm (`components/signup-form.test.tsx`)
- Renders "Create your account" title, description, all four inputs (Full Name, Email, Password, Confirm Password), Create Account button, and "Sign in" link
- Fires `onNameChange`, `onEmailChange`, `onPasswordChange`, `onConfirmPasswordChange` callbacks
- Fires `onSubmit` callback on form submission
- Fires `onSwitchToLogin` callback on clicking "Sign in"
- Displays error message when `error` prop is provided
- Disables all inputs and button when `pending` is `true`
- Shows "Creating account..." button text when pending
- Renders Terms of Service and Privacy Policy links

### Test Infrastructure

- **Environment:** jsdom (via Vitest)
- **Framework:** Vitest with globals enabled
- **Utilities:** React Testing Library (`render`, `screen`), `@testing-library/user-event`
- **Matchers:** `@testing-library/jest-dom` (e.g., `toBeInTheDocument`, `toBeDisabled`)
- **Mocks:**
  - `next/navigation` — `useRouter` (push, replace, refresh, back, forward)
  - `lucide-react` — `LoaderCircle` icon replaced with a test-friendly SVG

### Running Tests

```bash
# From the project root
npm run test:ui          # Run all UI tests once
npm run test:ui:watch    # Watch mode
npm run test:ui:coverage # With coverage report

# From the UI directory
npm test                 # Run all tests once
npm run test:coverage    # With coverage report
```

### Not Yet Covered

The following areas do not yet have unit tests and are candidates for future coverage:

- UI primitives (button, card, input, label, field, dialog, sidebar, etc.)
- Page components (`app/auth`, `app/chat`, `app/dashboard`, `app/projects`)
- Utility functions (`utils/utils.ts`, `utils/auth.ts`, `utils/project-api.ts`, `utils/backend-api-url.ts`)
- Custom hooks (`hooks/use-mobile.tsx`)
