import type { Section, SlateSettings, SlateState, Task } from './model';

/**
 * Slate's sync model is per-document last-write-wins:
 *
 *   - Every section and task is its own Firestore document whose id equals
 *     the entity id. Deletes are tombstones (`deleted: true`) so they
 *     propagate to every device instead of resurrecting.
 *   - The root document carries only schema metadata and settings.
 *   - Conflicts resolve entity-by-entity on `updatedAt`, with a canonical
 *     JSON tie-break so both devices converge regardless of argument order.
 *
 * Everything in this module is pure so the contract stays unit-testable.
 */

export interface CloudRootDocument {
  schemaVersion: 1;
  settings: SlateSettings;
  updatedAt: string;
}

export type CloudEntityDocument = Record<string, unknown> & { id?: unknown };

interface Stamped {
  updatedAt: string;
}

export interface SyncAccountClaims {
  email: string | null | undefined;
  emailVerified: boolean;
  /** `undefined` means the token claim could not be inspected (usually offline). */
  signInProvider: string | null | undefined;
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : 1))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);
  return `{${entries.join(',')}}`;
}

export function omitUndefinedDeep<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => omitUndefinedDeep(item)) as unknown as T;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (item === undefined) continue;
    result[key] = omitUndefinedDeep(item);
  }
  return result as T;
}

function timestampValue(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Mirrors the shared rules before Slate opens a private listener. A known
 * token claim is authoritative: a Google-linked account signed in by another
 * provider is not a Google session, and a missing claim fails closed.
 */
export function isVerifiedGoogleAccount(account: SyncAccountClaims): boolean {
  return Boolean(account.email?.trim())
    && account.emailVerified
    && account.signInProvider === 'google.com';
}

/** Latest logical write seen anywhere in a Slate document. */
export function latestStateTimestamp(state: SlateState): number {
  return Math.max(
    timestampValue(state.settings.updatedAt),
    ...state.sections.map((section) => timestampValue(section.updatedAt)),
    ...state.tasks.map((task) => timestampValue(task.updatedAt)),
  );
}

/**
 * Stamp a local mutation strictly after every write this device has observed.
 * A phone whose clock runs fast can otherwise pin its copy above a slower
 * laptop forever; advancing the logical clock lets the next real edit win.
 */
export function timestampAfterState(state: SlateState, deviceNow = Date.now()): string {
  return new Date(Math.max(deviceNow, latestStateTimestamp(state) + 1)).toISOString();
}

/** LWW with a deterministic tie-break: both sides converge on the same winner. */
export function selectNewer<T extends Stamped>(left: T, right: T): T {
  const leftTime = timestampValue(left.updatedAt);
  const rightTime = timestampValue(right.updatedAt);
  if (leftTime !== rightTime) return leftTime > rightTime ? left : right;
  const leftText = stableStringify(left);
  const rightText = stableStringify(right);
  if (leftText === rightText) return left;
  return leftText > rightText ? left : right;
}

function mergeById<T extends Stamped & { id: string }>(local: T[], remote: T[]): T[] {
  const merged = new Map<string, T>();
  for (const item of local) merged.set(item.id, item);
  for (const item of remote) {
    const existing = merged.get(item.id);
    merged.set(item.id, existing ? selectNewer(existing, item) : item);
  }
  return [...merged.values()];
}

export function mergeStates(local: SlateState, remote: SlateState): SlateState {
  return {
    version: 1,
    settings: selectNewer(local.settings, remote.settings),
    sections: mergeById(local.sections, remote.sections),
    tasks: mergeById(local.tasks, remote.tasks),
  };
}

export function serializeRootDocument(state: SlateState): CloudRootDocument {
  return omitUndefinedDeep({
    schemaVersion: 1,
    settings: state.settings,
    updatedAt: state.settings.updatedAt,
  });
}

export function serializeEntityDocument<T extends { id: string }>(entity: T) {
  return { id: entity.id, data: omitUndefinedDeep({ ...entity }) as Record<string, unknown> };
}

export function materializeCloudState(
  root: CloudRootDocument | null,
  sections: unknown[],
  tasks: unknown[],
): unknown {
  return {
    version: 1,
    settings: root?.settings ?? { theme: 'system', hideCompleted: false, updatedAt: new Date(0).toISOString() },
    sections,
    tasks,
  };
}

export interface InitialSyncResolution {
  state: SlateState;
  uploadSections: Section[];
  uploadTasks: Task[];
  uploadRoot: boolean;
}

function uploadCandidates<T extends Stamped & { id: string }>(merged: T[], cloud: T[]): T[] {
  const cloudById = new Map(cloud.map((item) => [item.id, item]));
  return merged.filter((item) => {
    const remote = cloudById.get(item.id);
    if (!remote) return true;
    return stableStringify(item) !== stableStringify(remote);
  });
}

/**
 * First contact after sign-in: merge, then upload exactly the documents the
 * cloud is missing or holds older copies of.
 */
export function resolveInitialSync(local: SlateState, cloud: SlateState | null): InitialSyncResolution {
  if (!cloud) {
    return {
      state: local,
      uploadSections: local.sections,
      uploadTasks: local.tasks,
      uploadRoot: true,
    };
  }
  const state = mergeStates(local, cloud);
  return {
    state,
    uploadSections: uploadCandidates(state.sections, cloud.sections),
    uploadTasks: uploadCandidates(state.tasks, cloud.tasks),
    uploadRoot: stableStringify(state.settings) !== stableStringify(cloud.settings),
  };
}

export function isCloudRoot(value: unknown): value is CloudRootDocument {
  if (!value || typeof value !== 'object') return false;
  const root = value as Partial<CloudRootDocument>;
  return root.schemaVersion === 1
    && typeof root.updatedAt === 'string'
    && Boolean(root.settings)
    && typeof root.settings === 'object';
}
