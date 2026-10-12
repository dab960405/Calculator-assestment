import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OperationSelector } from './OperationSelector';

const LABELS = ['Add', 'Subtract', 'Multiply', 'Divide', 'Power', 'Square root', 'Percentage'];

describe('OperationSelector', () => {
  it('renders one radio per operation inside the "Operation" group', () => {
    render(<OperationSelector value="add" onChange={() => {}} />);

    const group = screen.getByRole('group', { name: 'Operation' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((radio) => radio.getAttribute('value'))).toEqual([
      'add',
      'subtract',
      'multiply',
      'divide',
      'power',
      'sqrt',
      'percentage',
    ]);
    for (const label of LABELS) {
      expect(within(group).getByRole('radio', { name: label })).toBeInTheDocument();
    }
  });

  it('checks only the selected operation', () => {
    render(<OperationSelector value="divide" onChange={() => {}} />);

    expect(screen.getByRole('radio', { name: 'Divide' })).toBeChecked();
    expect(screen.getAllByRole('radio').filter((radio) => (radio as HTMLInputElement).checked)).toHaveLength(1);
  });

  it('calls onChange with the clicked operation id', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<OperationSelector value="add" onChange={onChange} />);

    await user.click(screen.getByRole('radio', { name: 'Square root' }));

    expect(onChange).toHaveBeenCalledExactlyOnceWith('sqrt');
  });

  it('supports keyboard selection with arrow keys', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<OperationSelector value="add" onChange={onChange} />);

    screen.getByRole('radio', { name: 'Add' }).focus();
    await user.keyboard('{ArrowRight}');

    expect(onChange).toHaveBeenCalledWith('subtract');
  });

  it('does not call onChange when the checked option is clicked again', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<OperationSelector value="add" onChange={onChange} />);

    await user.click(screen.getByRole('radio', { name: 'Add' }));

    expect(onChange).not.toHaveBeenCalled();
  });
});
