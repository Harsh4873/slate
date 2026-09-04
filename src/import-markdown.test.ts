import { describe, expect, it } from 'vitest';
import { parseMarkdownImport } from './import-markdown';

describe('parseMarkdownImport', () => {
  it('groups checklist items under the heading above them', () => {
    const result = parseMarkdownImport('CSCE 671\n- [ ] Read the paper\n- [ ] Submit the folder URL');
    expect(result.lists).toHaveLength(1);
    expect(result.lists[0].title).toBe('CSCE 671');
    expect(result.lists[0].tasks.map((task) => task.title)).toEqual([
      'Read the paper',
      'Submit the folder URL',
    ]);
    expect(result.taskCount).toBe(2);
  });

  it('reads a checked box as a done task', () => {
    const result = parseMarkdownImport('DAILY\n- [x] gym\n- [X] read\n- [ ] sleep');
    expect(result.lists[0].tasks).toEqual([
      { title: 'gym', done: true },
      { title: 'read', done: true },
      { title: 'sleep', done: false },
    ]);
  });

  it('drops a heading that only groups other headings', () => {
    const result = parseMarkdownImport(
      'CLASSES\nCSCE 671\n- [ ] Read the paper\nCSCE 627\n- [ ] Check Canvas',
    );
    expect(result.lists.map((list) => list.title)).toEqual(['CSCE 671', 'CSCE 627']);
    expect(result.droppedHeadings).toEqual(['CLASSES']);
  });

  it('collapses a heading repeated on consecutive lines', () => {
    const result = parseMarkdownImport('Todos -- Sep 4\nTodos -- Sep 4\n- [ ] one thing');
    expect(result.lists).toHaveLength(1);
    expect(result.lists[0].title).toBe('Todos -- Sep 4');
    expect(result.droppedHeadings).toEqual([]);
  });

  it('appends to the same list when a heading repeats later', () => {
    const result = parseMarkdownImport('DAILY\n- [ ] gym\nEXTRAS\n- [ ] petition\nDAILY\n- [ ] sleep');
    expect(result.lists.map((list) => list.title)).toEqual(['DAILY', 'EXTRAS']);
    expect(result.lists[0].tasks.map((task) => task.title)).toEqual(['gym', 'sleep']);
  });

  it('accepts markdown heading markers, bold, and a trailing colon', () => {
    const result = parseMarkdownImport('## **Life tasks:**\n- [ ] haircut');
    expect(result.lists[0].title).toBe('Life tasks');
  });

  it('accepts plain bullets and numbered items as open tasks', () => {
    const result = parseMarkdownImport('EXTRAS\n- career fair\n* apply to jobs\n1. read ISSS\n2) then CSCE');
    expect(result.lists[0].tasks.map((task) => task.title)).toEqual([
      'career fair',
      'apply to jobs',
      'read ISSS',
      'then CSCE',
    ]);
    expect(result.lists[0].tasks.every((task) => !task.done)).toBe(true);
  });

  it('puts items that appear before any heading into the fallback list', () => {
    const result = parseMarkdownImport('- [ ] loose item', 'Inbox');
    expect(result.lists[0].title).toBe('Inbox');
    expect(result.lists[0].tasks[0].title).toBe('loose item');
  });

  it('ignores blank lines, horizontal rules, and empty checkboxes', () => {
    const result = parseMarkdownImport('DAILY\n\n---\n- [ ]\n- [ ]    \n- [ ] real task\n***\n');
    expect(result.lists).toHaveLength(1);
    expect(result.lists[0].tasks).toEqual([{ title: 'real task', done: false }]);
  });

  it('returns nothing for empty or heading-only input', () => {
    expect(parseMarkdownImport('').lists).toEqual([]);
    expect(parseMarkdownImport('   \n\n  ').lists).toEqual([]);
    const headingOnly = parseMarkdownImport('CLASSES\nCSCE 671');
    expect(headingOnly.lists).toEqual([]);
    expect(headingOnly.taskCount).toBe(0);
    expect(headingOnly.droppedHeadings).toEqual(['CLASSES', 'CSCE 671']);
  });

  it('caps a long task title at the input maximum', () => {
    const result = parseMarkdownImport(`NOTES\n- [ ] ${'x'.repeat(500)}`);
    expect(result.lists[0].tasks[0].title).toHaveLength(400);
  });

  it('keeps punctuation and slashes inside item text intact', () => {
    const result = parseMarkdownImport('IOERGER / RIFTNSEQ\n- [ ] every LRT, hits, QC, pdtaR/S');
    expect(result.lists[0].title).toBe('IOERGER / RIFTNSEQ');
    expect(result.lists[0].tasks[0].title).toBe('every LRT, hits, QC, pdtaR/S');
  });

  // The outline this feature was built for, trimmed to its structure.
  it('parses a real daily dump into one list per section', () => {
    const source = [
      'Todos -- Sep 4',
      'Todos -- Sep 4',
      '',
      'CLASSES',
      '',
      'CSCE 671',
      '- [ ] Finish bio PDF (fill photo slots)',
      '- [ ] Confirm Canvas due time',
      '- [ ] Read Peng et al. 2018 SpeechBubbles before Tue 9:35',
      '',
      'CSCE 627',
      '- [ ] Check Canvas for HW1',
      '- [ ] Review Sipser 2e section 1.2 / Ex. 1.41',
      '',
      'IOERGER / RIFTNSEQ',
      '- [ ] Write the systematic supplement',
      '',
      'DAILY',
      '- [ ] banana + creatine',
      '- [ ] gym',
      '- [ ] sleep',
      '',
      'LIFE TASKS',
      '- [ ] Tonight 6-8: Polo Barn trail (3869 F&B Rd)',
    ].join('\n');

    const result = parseMarkdownImport(source);

    expect(result.lists.map((list) => list.title)).toEqual([
      'CSCE 671',
      'CSCE 627',
      'IOERGER / RIFTNSEQ',
      'DAILY',
      'LIFE TASKS',
    ]);
    expect(result.lists.map((list) => list.tasks.length)).toEqual([3, 2, 1, 3, 1]);
    expect(result.taskCount).toBe(10);
    // The document title and the CLASSES group label carry no items of their own.
    expect(result.droppedHeadings).toEqual(['Todos -- Sep 4', 'CLASSES']);
  });
});
