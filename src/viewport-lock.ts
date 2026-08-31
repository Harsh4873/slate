/** Visible phone viewport: follows the iOS URL bar and the on-screen keyboard. */
export function measureViewport(
  viewport?: Pick<VisualViewport, 'height' | 'offsetTop'> | null,
  innerHeight = 0,
) {
  const height = Math.max(1, Math.round(viewport?.height ?? innerHeight));
  const offsetTop = Math.max(0, Math.round(viewport?.offsetTop ?? 0));
  return { height, offsetTop };
}

export function applyViewportLock(
  root: { style: { setProperty(name: string, value: string): void } },
  viewport?: Pick<VisualViewport, 'height' | 'offsetTop'> | null,
  innerHeight = 0,
) {
  const { height, offsetTop } = measureViewport(viewport, innerHeight);
  root.style.setProperty('--app-height', `${height}px`);
  root.style.setProperty('--app-offset-top', `${offsetTop}px`);
  return { height, offsetTop };
}
