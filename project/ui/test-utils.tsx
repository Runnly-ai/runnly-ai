import { render } from '@testing-library/react';
import { ReactElement } from 'react';

const customRender = (ui: ReactElement, options = {}) => {
  return render(ui, {
    // wrap provider(s) here if needed
    ...options,
  });
};

export * from '@testing-library/react';
export { customRender as render };