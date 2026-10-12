import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { OperandInput } from './OperandInput';

describe('OperandInput', () => {
  it('renders a labelled text input with a decimal keyboard', () => {
    render(<OperandInput id="a" label="First number" value="12" error={undefined} onChange={() => {}} />);

    const input = screen.getByRole('textbox', { name: 'First number' });
    expect(input).toHaveValue('12');
    expect(input).toHaveAttribute('inputmode', 'decimal');
    expect(input).toHaveAttribute('aria-invalid', 'false');
    expect(input).not.toHaveAttribute('aria-describedby');
  });

  it('reports every change with the raw string', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<OperandInput id="a" label="First number" value="" error={undefined} onChange={onChange} />);

    await user.type(screen.getByRole('textbox', { name: 'First number' }), '7');

    expect(onChange).toHaveBeenCalledWith('7');
  });

  it('shows the error and links it to the input', () => {
    render(<OperandInput id="a" label="First number" value="" error="Enter a number." onChange={() => {}} />);

    const input = screen.getByRole('textbox', { name: 'First number' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Enter a number.');
    expect(screen.getByText('Enter a number.')).toBeInTheDocument();
  });

  it('forwards the ref to the input element', () => {
    const ref = createRef<HTMLInputElement>();
    render(<OperandInput ref={ref} id="a" label="First number" value="" error={undefined} onChange={() => {}} />);

    expect(ref.current).toBe(screen.getByRole('textbox', { name: 'First number' }));
  });
});
