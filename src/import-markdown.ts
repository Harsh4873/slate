// Bulk import: turn a pasted markdown outline into lists of tasks.
//
// The shape this targets is a plain daily-todo dump — a heading, then checklist
// items under it, repeated. Two header levels are common in real notes (a group
// label like CLASSES, then a specific one like CSCE 671), but Slate's model has
// only lists and tasks. So a heading that never gets an item of its own is
// treated as a grouping label and dropped, rather than importing as an empty
// list. That is what keeps CLASSES from becoming clutter while CSCE 671 and
// CSCE 627 each become a list.

const MAX_LIST_TITLE = 200; // matches the list title input's maxLength
const MAX_TASK_TITLE = 400; // matches the task text input's maxLength

/** `- [ ] text`, `* [x] text`, `1. [ ] text` */
const CHECKBOX = /^\s*(?:[-*+]|\d+[.)])\s+\[([ xX])\]\s*(.*)$/;
/** `- text`, `* text`, `+ text` */
const BULLET = /^\s*[-*+]\s+(.*)$/;
/** `1. text`, `2) text` */
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
/** `---`, `***`, `___` */
const HORIZONTAL_RULE = /^\s*([-*_])\s*(?:\1\s*){2,}$/;

export interface ImportedTask {
  title: string;
  done: boolean;
}

export interface ImportedList {
  title: string;
  tasks: ImportedTask[];
}

export interface ImportPreview {
  lists: ImportedList[];
  taskCount: number;
  /** Headings that carried no items of their own, so were read as group labels. */
  droppedHeadings: string[];
}

function cleanHeading(line: string): string {
  return line
    .replace(/^\s*#{1,6}\s+/, '') // markdown heading markers
    .replace(/\*\*/g, '') // bold
    .replace(/^[*_\s]+/, '')
    .replace(/[*_\s]+$/, '')
    .replace(/[:：]$/, '') // trailing colon, common in hand-written headers
    .trim()
    .slice(0, MAX_LIST_TITLE);
}

export function parseMarkdownImport(text: string, fallbackTitle = 'Imported'): ImportPreview {
  const lines = text.split(/\r?\n/);
  const lists: ImportedList[] = [];
  const droppedHeadings: string[] = [];
  const byTitle = new Map<string, ImportedList>();

  let current: ImportedList | null = null;
  // A heading is held here until an item actually arrives under it, so a
  // heading that only groups other headings never becomes a list.
  let pending: string | null = null;

  function openList(title: string): ImportedList {
    // A repeated heading appends to the list it already opened rather than
    // creating a second list with the same name.
    const existing = byTitle.get(title.toLowerCase());
    if (existing) return existing;
    const list: ImportedList = { title, tasks: [] };
    lists.push(list);
    byTitle.set(title.toLowerCase(), list);
    return list;
  }

  function addTask(title: string, done: boolean): void {
    const trimmed = title.trim().slice(0, MAX_TASK_TITLE);
    if (!trimmed) return;
    if (pending !== null) {
      current = openList(pending);
      pending = null;
    }
    if (current === null) {
      // Items before any heading still need somewhere to land.
      current = openList(fallbackTitle);
    }
    current.tasks.push({ title: trimmed, done });
  }

  for (const raw of lines) {
    if (!raw.trim() || HORIZONTAL_RULE.test(raw)) continue;

    const checkbox = raw.match(CHECKBOX);
    if (checkbox) {
      addTask(checkbox[2], checkbox[1].toLowerCase() === 'x');
      continue;
    }

    const bullet = raw.match(BULLET) ?? raw.match(NUMBERED);
    if (bullet) {
      addTask(bullet[1], false);
      continue;
    }

    // Anything else is a heading.
    const heading = cleanHeading(raw);
    if (!heading) continue;
    if (pending !== null && pending.toLowerCase() !== heading.toLowerCase()) {
      // The previous heading never got an item: a group label.
      droppedHeadings.push(pending);
    }
    pending = heading;
    current = null;
  }

  if (pending !== null) droppedHeadings.push(pending);

  return {
    lists,
    taskCount: lists.reduce((total, list) => total + list.tasks.length, 0),
    droppedHeadings,
  };
}
