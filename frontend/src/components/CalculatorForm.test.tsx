import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, calculate } from '../api/calculatorClient';
import { CalculatorForm } from './CalculatorForm';

vi.mock('../api/calculatorClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/calculatorClient')>()),
  calculate: vi.fn(),
}));

const calculateMock = vi.mocked(calculate);

function setup() {
  const user = userEvent.setup();
  render(<CalculatorForm />);
  return {
    user,
    first: () => screen.getByRole('textbox', { name: 'First number' }),
    second: () => screen.getByRole('textbox', { name: 'Second number' }),
    submitButton: () => screen.getByRole('button', { name: /calculat/i }),
  };
}

beforeEach(() => {
  calculateMock.mockReset();
});

describe('CalculatorForm: render', () => {
  it('starts with Add selected, two empty inputs and the idle hint', () => {
    const { first, second, submitButton } = setup();

    expect(screen.getByRole('radio', { name: 'Add' })).toBeChecked();
    expect(first()).toHaveValue('');
    expect(second()).toHaveValue('');
    expect(submitButton()).toHaveTextContent('Calculate');
    expect(submitButton()).toBeEnabled();
    expect(screen.getByText('Pick an operation, enter your numbers and press Calculate.')).toBeInTheDocument();
  });

  it('relabels the inputs for the selected operation', async () => {
    const { user } = setup();

    await user.click(screen.getByRole('radio', { name: 'Power' }));

    expect(screen.getByRole('textbox', { name: 'Base' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Exponent' })).toBeInTheDocument();
  });

  it('shows a single input for square root and keeps the typed value', async () => {
    const { user, first } = setup();
    await user.type(first(), '9');

    await user.click(screen.getByRole('radio', { name: 'Square root' }));

    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.getByRole('textbox', { name: 'Number' })).toHaveValue('9');
  });
});

describe('CalculatorForm: validation', () => {
  it('shows errors for both empty fields, focuses the first and does not call the API', async () => {
    const { user, first, second, submitButton } = setup();

    await user.click(submitButton());

    expect(first()).toHaveAccessibleDescription('Enter a number.');
    expect(second()).toHaveAccessibleDescription('Enter a number.');
    expect(first()).toHaveAttribute('aria-invalid', 'true');
    expect(first()).toHaveFocus();
    expect(calculateMock).not.toHaveBeenCalled();
  });

  it('focuses the second field when only it is invalid', async () => {
    const { user, first, second, submitButton } = setup();
    await user.type(first(), '2');
    await user.type(second(), '1,5');

    await user.click(submitButton());

    expect(first()).toHaveAttribute('aria-invalid', 'false');
    expect(second()).toHaveAccessibleDescription('Enter a valid number, like 12 or 3.5.');
    expect(second()).toHaveFocus();
  });

  it('clears only the edited field error', async () => {
    const { user, first, second, submitButton } = setup();
    await user.click(submitButton());

    await user.type(first(), '1');
    expect(first()).toHaveAttribute('aria-invalid', 'false');
    expect(second()).toHaveAttribute('aria-invalid', 'true');

    await user.click(submitButton());
    await user.clear(first());
    await user.click(submitButton());
    await user.type(second(), '2');
    expect(second()).toHaveAttribute('aria-invalid', 'false');
    expect(first()).toHaveAttribute('aria-invalid', 'true');
  });

  it('drops the second error when switching to a unary operation', async () => {
    const { user, first, submitButton } = setup();
    await user.type(first(), 'abc');
    await user.click(submitButton());

    await user.click(screen.getByRole('radio', { name: 'Square root' }));

    expect(screen.getByRole('textbox', { name: 'Number' })).toHaveAccessibleDescription(
      'Enter a valid number, like 12 or 3.5.',
    );
    expect(screen.queryAllByText('Enter a number.')).toHaveLength(0);
  });

  it('clears all errors when switching to unary with a valid first field', async () => {
    const { user, first, submitButton } = setup();
    await user.type(first(), '4');
    await user.click(submitButton());
    expect(screen.getByText('Enter a number.')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Square root' }));

    expect(screen.queryByText('Enter a number.')).not.toBeInTheDocument();
  });

  it('keeps errors when switching between binary operations', async () => {
    const { user, submitButton } = setup();
    await user.click(submitButton());

    await user.click(screen.getByRole('radio', { name: 'Multiply' }));

    expect(screen.getAllByText('Enter a number.')).toHaveLength(2);
  });
});

describe('CalculatorForm: submit', () => {
  it('sends the parsed request and shows the formatted result', async () => {
    calculateMock.mockResolvedValue(0.30000000000000004);
    const { user, first, second, submitButton } = setup();

    await user.type(first(), ' 0.1 ');
    await user.type(second(), '0.2');
    await user.click(submitButton());

    expect(calculateMock).toHaveBeenCalledExactlyOnceWith(
      { operation: 'add', a: 0.1, b: 0.2 },
      expect.any(AbortSignal),
    );
    expect(await screen.findByText('0.3')).toBeInTheDocument();
  });

  it('submits with the Enter key', async () => {
    calculateMock.mockResolvedValue(3);
    const { user } = setup();

    await user.click(screen.getByRole('radio', { name: 'Square root' }));
    await user.type(screen.getByRole('textbox', { name: 'Number' }), '9{Enter}');

    expect(calculateMock).toHaveBeenCalledWith({ operation: 'sqrt', a: 9 }, expect.any(AbortSignal));
    expect(await screen.findByText('3')).toBeInTheDocument();
  });

  it('disables the button and shows "Calculating..." while loading', async () => {
    let resolve!: (value: number) => void;
    calculateMock.mockReturnValue(new Promise((res) => (resolve = res)));
    const { user, first, second, submitButton } = setup();
    await user.type(first(), '2');
    await user.type(second(), '3');

    await user.click(submitButton());

    expect(submitButton()).toBeDisabled();
    expect(submitButton()).toHaveTextContent('Calculating...');

    await act(async () => resolve(5));
    expect(submitButton()).toBeEnabled();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('ignores a form submit while loading', async () => {
    calculateMock.mockReturnValue(new Promise(() => {}));
    const { user, first, second, submitButton } = setup();
    await user.type(first(), '2');
    await user.type(second(), '3');
    await user.click(submitButton());

    const form = submitButton().closest('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);

    expect(calculateMock).toHaveBeenCalledTimes(1);
  });

  it('shows the API error as an alert', async () => {
    calculateMock.mockRejectedValue(new ApiError('DIVISION_BY_ZERO', 'Division by zero is not allowed.', 422));
    const { user, first, second, submitButton } = setup();
    await user.click(screen.getByRole('radio', { name: 'Divide' }));
    await user.type(first(), '1');
    await user.type(second(), '0');

    await user.click(submitButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "You can't divide by zero. Change the second number.",
    );
    expect(submitButton()).toBeEnabled();
  });

  it('clears the error when the user edits a value', async () => {
    calculateMock.mockRejectedValue(new ApiError('NETWORK_ERROR'));
    const { user, first, second, submitButton } = setup();
    await user.type(first(), '1');
    await user.type(second(), '2');
    await user.click(submitButton());
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await user.type(second(), '3');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Pick an operation, enter your numbers and press Calculate.')).toBeInTheDocument();
  });

  it('clears the result when the operation changes', async () => {
    calculateMock.mockResolvedValue(5);
    const { user, first, second, submitButton } = setup();
    await user.type(first(), '2');
    await user.type(second(), '3');
    await user.click(submitButton());
    expect(await screen.findByText('5')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Multiply' }));

    expect(screen.queryByText('5')).not.toBeInTheDocument();
  });
});
