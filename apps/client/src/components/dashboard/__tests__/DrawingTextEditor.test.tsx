import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DrawingTextEditor } from '../DrawingTextEditor';
import { MAX_DRAWING_TEXT } from '@/lib/drawingActions';

function open(initialText = 'Old') {
  const onSave = vi.fn();
  const onClose = vi.fn();
  render(<DrawingTextEditor initialText={initialText} onSave={onSave} onClose={onClose} />);
  const box = screen.getByRole('textbox');
  fireEvent.change(box, { target: { value: 'New text' } });
  return { onSave, onClose, box };
}

afterEach(cleanup);

describe('DrawingTextEditor', () => {
  it('should bound the text, which is saved to localStorage with every edit', () => {
    open();
    expect(screen.getByRole('textbox').getAttribute('maxlength')).toBe(String(MAX_DRAWING_TEXT));
  });

  it('[10.7.4] should save the typed text on Save', () => {
    const { onSave, onClose } = open();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith('New text');
    expect(onClose).toHaveBeenCalled();
  });

  it('[10.7.4] should save on Ctrl+Enter', () => {
    const { onSave, box } = open();
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
    expect(onSave).toHaveBeenCalledWith('New text');
  });

  it('[10.7.4] should discard the text on Cancel, even after the textarea lost the focus', () => {
    const { onSave, onClose, box } = open();
    // Pressing Cancel first takes the focus off the textarea
    fireEvent.blur(box);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('[10.7.4] should discard the text on Escape and on a press outside', () => {
    const { onSave, onClose, box } = open();
    fireEvent.keyDown(box, { key: 'Escape' });
    // The backdrop: the dialog's parent
    fireEvent.mouseDown(box.parentElement!.parentElement!);
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('should start from the drawing’s current text', () => {
    render(<DrawingTextEditor initialText="Breakout" onSave={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('textbox')).toHaveProperty('value', 'Breakout');
  });
});
