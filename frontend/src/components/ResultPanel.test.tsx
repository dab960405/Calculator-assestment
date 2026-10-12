import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/calculatorClient';
import { ResultPanel } from './ResultPanel';

function liveRegion(): HTMLElement {
  return within(screen.getByRole('region', { name: 'Result' })).getAllByRole('status')[0] as HTMLElement;
}

describe('ResultPanel', () => {
  it('shows the hint when idle', () => {
    render(<ResultPanel state={{ status: 'idle' }} />);

    expect(liveRegion()).toHaveTextContent('Pick an operation, enter your numbers and press Calculate.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('announces loading in the polite live region', () => {
    render(<ResultPanel state={{ status: 'loading' }} />);

    expect(liveRegion()).toHaveAttribute('aria-live', 'polite');
    expect(liveRegion()).toHaveTextContent('Calculating...');
  });

  it('shows the formatted result', () => {
    render(<ResultPanel state={{ status: 'success', result: 0.1 + 0.2 }} />);

    expect(liveRegion()).toHaveTextContent('Result0.3');
    expect(screen.getByText('0.3').tagName).toBe('OUTPUT');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the user-facing error message in an alert', () => {
    const error = new ApiError('DIVISION_BY_ZERO', 'Division by zero is not allowed.', 422);
    render(<ResultPanel state={{ status: 'error', error }} />);

    expect(screen.getByRole('alert')).toHaveTextContent("You can't divide by zero. Change the second number.");
    expect(screen.queryByText('Division by zero is not allowed.')).not.toBeInTheDocument();
    expect(liveRegion()).toBeEmptyDOMElement();
  });
});
