import type { SlateState } from './model';
import { needsRebalance, orderBetween, rebalanced, sortByOrder } from './order';

/**
 * Place `taskId` in `sectionId`. `beforeTaskId === null` means the end of
 * that section — including dropping onto the add-row or empty body.
 */
export function applyMoveTask(
  previous: SlateState,
  taskId: string,
  sectionId: string,
  beforeTaskId: string | null,
  now: string,
): SlateState {
  const moving = previous.tasks.find((task) => task.id === taskId && !task.deleted);
  const targetSection = previous.sections.find((section) => section.id === sectionId && !section.deleted);
  if (!moving || !targetSection) return previous;
  if (beforeTaskId === taskId) return previous;

  const siblings = sortByOrder(
    previous.tasks.filter((task) => task.sectionId === sectionId && !task.deleted && task.id !== taskId),
  );
  const beforeIndex = beforeTaskId ? siblings.findIndex((task) => task.id === beforeTaskId) : siblings.length;
  const anchorIndex = beforeIndex < 0 ? siblings.length : beforeIndex;
  const previousOrder = anchorIndex > 0 ? siblings[anchorIndex - 1].order : undefined;
  const nextOrder = anchorIndex < siblings.length ? siblings[anchorIndex].order : undefined;

  if (needsRebalance(previousOrder, nextOrder)) {
    const reordered = [...siblings];
    reordered.splice(anchorIndex, 0, { ...moving, sectionId });
    const assignments = rebalanced(reordered);
    const touched = new Set<string>();
    const tasks = previous.tasks.map((task) => {
      const assigned = assignments.get(task.id);
      if (assigned === undefined) return task;
      if (task.id === taskId) {
        touched.add(task.id);
        return { ...task, sectionId, order: assigned, updatedAt: now };
      }
      if (task.order === assigned) return task;
      touched.add(task.id);
      return { ...task, order: assigned, updatedAt: now };
    });
    return touched.size ? { ...previous, tasks } : previous;
  }

  const order = orderBetween(previousOrder, nextOrder);
  if (moving.sectionId === sectionId && moving.order === order) return previous;
  const tasks = previous.tasks.map((task) => (
    task.id === taskId ? { ...task, sectionId, order, updatedAt: now } : task
  ));
  return { ...previous, tasks };
}
