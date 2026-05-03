# UI Testing

This document describes how to run and write tests for the UI components.

## Running Tests

From the root project directory:

```bash
# Run all UI tests once
npm run test:ui

# Run UI tests in watch mode
npm run test:ui:watch

# Run UI tests with coverage
npm run test:ui:coverage
```

From the UI directory:

```bash
# Run all tests once
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm run test:coverage
```

## Test Structure

- Component tests are colocated with the components (e.g., `login-form.test.tsx`)
- Page tests are in the page directories (e.g., `app/auth/page.test.tsx`)
- Test utilities are in `test-utils.tsx`
- Vitest configuration is in `vitest.config.ts`
- Test setup is in `vitest.setup.ts`

## Writing Tests

- Use React Testing Library for component testing
- Mock external dependencies (API calls, Next.js router, etc.)
- Test both positive and negative scenarios
- Test user interactions with `@testing-library/user-event`
- Follow the existing test patterns in the codebase