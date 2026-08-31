import { describe, expect, it } from 'vitest';
import { applyViewportLock, measureViewport } from './viewport-lock';

describe('measureViewport', () => {
  it('uses the visual viewport when the keyboard or Safari chrome shrinks the screen', () => {
    expect(measureViewport({ height: 512.4, offsetTop: 118.6 }, 844)).toEqual({
      height: 512,
      offsetTop: 119,
    });
  });

  it('falls back to the window height on browsers without visualViewport', () => {
    expect(measureViewport(null, 844)).toEqual({ height: 844, offsetTop: 0 });
  });
});

describe('applyViewportLock', () => {
  it('writes the locked height onto the document so the shell can fill the phone', () => {
    const vars: Record<string, string> = {};
    const root = {
      style: {
        setProperty(name: string, value: string) {
          vars[name] = value;
        },
      },
    };
    applyViewportLock(root, { height: 640, offsetTop: 47 }, 844);
    expect(vars['--app-height']).toBe('640px');
    expect(vars['--app-offset-top']).toBe('47px');
  });
});
