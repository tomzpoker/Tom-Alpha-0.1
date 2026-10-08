import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export type TaskStatus = 'todo' | 'in_progress' | 'done';

export interface Task {
  id: string;
  list_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  start_at: string | null;
  end_at: string | null;
  all_day: boolean;
  tags: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  list_name: string | null;
  list_color: string | null;
}

export interface TaskList {
  id: string;
  name: string;
  color: string;
}

export interface TaskPayload {
  title: string;
  description: string | null;
  listId: string | null;
  status: TaskStatus;
  startAt: string | null;
  endAt: string | null;
  allDay: boolean;
}

export interface ImportReport {
  lists_inserted: number;
  tasks_inserted: number;
}

export const api = {
  listRange: (from: string, to: string) =>
    invoke<Task[]>('list_tasks_range', { from, to }),

  create: (payload: {
    title: string;
    listId?: string;
    description?: string;
    startAt?: string;
    endAt?: string;
    allDay?: boolean;
  }) =>
    invoke<Task>('create_task', {
      title: payload.title,
      listId: payload.listId ?? null,
      description: payload.description ?? null,
      startAt: payload.startAt ?? null,
      endAt: payload.endAt ?? null,
      allDay: payload.allDay ?? false,
    }),

  createFull: (payload: TaskPayload) =>
    invoke<Task>('create_task_full', payload),

  saveFull: (id: string, payload: TaskPayload) =>
    invoke<Task>('save_task', { id, ...payload }),

  setStatus: (id: string, status: TaskStatus) =>
    invoke<Task>('set_task_status', { id, status }),

  update: (
    id: string,
    patch: Partial<Pick<Task, 'title' | 'description' | 'start_at' | 'end_at'>>
  ) =>
    invoke<Task>('update_task', {
      id,
      title: patch.title ?? null,
      description: patch.description ?? null,
      startAt: patch.start_at ?? null,
      endAt: patch.end_at ?? null,
    }),

  remove: (id: string) => invoke<void>('delete_task', { id }),

  lists: () => invoke<TaskList[]>('list_task_lists'),

  createList: (name: string, color: string) =>
    invoke<TaskList>('create_task_list', { name, color }),

  updateList: (id: string, name: string, color: string) =>
    invoke<TaskList>('update_task_list', { id, name, color }),

  deleteList: (id: string) =>
    invoke<void>('delete_task_list', { id }),

  bulkImport: (items: unknown[]) => invoke<number>('bulk_import_tasks', { items }),

  exportToFile: (path: string) =>
    invoke<number>('export_to_file', { path }),

  importFromFile: (path: string) =>
    invoke<ImportReport>('import_from_file', { path }),

  onChanged: (cb: () => void): Promise<UnlistenFn> =>
    listen<string>('tasks:changed', () => cb()),
};