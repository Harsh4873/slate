export type DropTarget = {
  sectionId: string;
  beforeTaskId: string | null;
};

export function sameDropTarget(left: DropTarget | null, right: DropTarget | null) {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.sectionId === right.sectionId && left.beforeTaskId === right.beforeTaskId;
}

/**
 * Top half of a row inserts before it. Bottom half inserts after it
 * (before the next row, or at the end of the section when there isn't one).
 */
export function dropTargetForTaskRow(
  sectionId: string,
  hoveredTaskId: string,
  nextTaskId: string | null,
  pointerY: number,
  rowTop: number,
  rowHeight: number,
  dragTaskId: string,
): DropTarget | null {
  if (!hoveredTaskId || hoveredTaskId === dragTaskId) return null;
  const insertBefore = pointerY < rowTop + rowHeight / 2;
  if (insertBefore) return { sectionId, beforeTaskId: hoveredTaskId };
  if (nextTaskId && nextTaskId !== dragTaskId) {
    return { sectionId, beforeTaskId: nextTaskId };
  }
  return { sectionId, beforeTaskId: null };
}

export function dropTargetForSectionEdge(
  sectionId: string,
  firstOtherTaskId: string | null,
): DropTarget {
  return { sectionId, beforeTaskId: firstOtherTaskId };
}

function nextDropTaskId(taskEl: Element, dragTaskId: string): string | null {
  let sibling = taskEl.nextElementSibling;
  while (sibling) {
    const id = sibling.getAttribute('data-drop-task');
    if (id && id !== dragTaskId) return id;
    sibling = sibling.nextElementSibling;
  }
  return null;
}

function firstOtherTaskId(sectionEl: Element, dragTaskId: string): string | null {
  for (const node of sectionEl.querySelectorAll('[data-drop-task]')) {
    const id = node.getAttribute('data-drop-task');
    if (id && id !== dragTaskId) return id;
  }
  return null;
}

export function resolveDropFromPoint(
  x: number,
  y: number,
  dragTaskId: string,
  view: Pick<Document, 'elementFromPoint'> = document,
): DropTarget | null {
  const hit = view.elementFromPoint(x, y);
  if (!(hit instanceof Element)) return null;
  const sectionEl = hit.closest('[data-drop-section]');
  if (!sectionEl) return null;
  const sectionId = sectionEl.getAttribute('data-drop-section');
  if (!sectionId) return null;

  if (hit.closest('[data-drop-start]')) {
    return dropTargetForSectionEdge(sectionId, firstOtherTaskId(sectionEl, dragTaskId));
  }

  const taskEl = hit.closest('[data-drop-task]');
  if (taskEl) {
    const taskId = taskEl.getAttribute('data-drop-task');
    if (!taskId) return dropTargetForSectionEdge(sectionId, null);
    const rect = taskEl.getBoundingClientRect();
    return dropTargetForTaskRow(
      sectionId,
      taskId,
      nextDropTaskId(taskEl, dragTaskId),
      y,
      rect.top,
      rect.height,
      dragTaskId,
    );
  }

  return dropTargetForSectionEdge(sectionId, null);
}
