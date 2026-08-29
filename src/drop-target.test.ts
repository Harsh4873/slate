import { describe, expect, it } from 'vitest';
import { dropTargetForSectionEdge, dropTargetForTaskRow, sameDropTarget } from './drop-target';

describe('dropTargetForTaskRow', () => {
  it('inserts before the hovered row on its top half', () => {
    expect(dropTargetForTaskRow('inbox', 'b', 'c', 10, 0, 40, 'a')).toEqual({
      sectionId: 'inbox',
      beforeTaskId: 'b',
    });
  });

  it('inserts after the hovered row on its bottom half', () => {
    expect(dropTargetForTaskRow('inbox', 'b', 'c', 30, 0, 40, 'a')).toEqual({
      sectionId: 'inbox',
      beforeTaskId: 'c',
    });
  });

  it('drops at the end of the section after the last row', () => {
    expect(dropTargetForTaskRow('inbox', 'c', null, 30, 0, 40, 'a')).toEqual({
      sectionId: 'inbox',
      beforeTaskId: null,
    });
  });

  it('ignores the row that is being dragged', () => {
    expect(dropTargetForTaskRow('inbox', 'a', 'b', 10, 0, 40, 'a')).toBeNull();
  });
});

describe('dropTargetForSectionEdge', () => {
  it('places a task at the start when another row can be the anchor', () => {
    expect(dropTargetForSectionEdge('work', 'first')).toEqual({
      sectionId: 'work',
      beforeTaskId: 'first',
    });
  });

  it('places a task at the end of an empty or self-only section', () => {
    expect(dropTargetForSectionEdge('work', null)).toEqual({
      sectionId: 'work',
      beforeTaskId: null,
    });
  });
});

describe('sameDropTarget', () => {
  it('compares section and insert point', () => {
    expect(sameDropTarget(null, null)).toBe(true);
    expect(sameDropTarget({ sectionId: 'a', beforeTaskId: null }, { sectionId: 'a', beforeTaskId: null })).toBe(true);
    expect(sameDropTarget({ sectionId: 'a', beforeTaskId: 'x' }, { sectionId: 'a', beforeTaskId: null })).toBe(false);
  });
});
