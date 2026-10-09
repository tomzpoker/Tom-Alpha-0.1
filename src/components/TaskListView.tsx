import { useEffect, useState } from 'react';
import { api, type Task, type TaskStatus } from '../lib/api';
import { formatTaskDate } from '../lib/formatDate';
import TaskModal from './TaskModal';
import TaskLinksModal from './TaskLinksModal';

interface Props {
  hiddenListIds: Set<string>;
}

const statusLabel: Record<TaskStatus, string> = {
  todo: 'À faire',
  in_progress: 'En cours',
  done: 'Validé',
};

const statusColor: Record<TaskStatus, string> = {
  todo: '#60a5fa',
  in_progress: '#fbbf24',
  done: '#34d399',
};

const statusBadgeStyle: Record<
  TaskStatus,
  { bg: string; text: string; border: string }
> = {
  todo:        { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
  in_progress: { bg: '#fef3c7', text: '#b45309', border: '#fcd34d' },
  done:        { bg: '#d1fae5', text: '#047857', border: '#86efac' },
};

const nextStatus: Record<TaskStatus, TaskStatus> = {
  todo: 'in_progress',
  in_progress: 'done',
  done: 'todo',
};

type Group = { key: string; label: string; tasks: Task[] };

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function daysBetween(a: Date, b: Date) {
  return Math.floor(
    (startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000
  );
}

/** Dimanche 23h59:59 de la semaine calendaire contenant `ref` (semaine lundi→dimanche) */
function getWeekEnd(ref: Date): Date {
  const d = new Date(ref);
  const day = d.getDay(); // 0 = dimanche, 1 = lundi, ..., 6 = samedi
  const daysUntilSunday = day === 0 ? 0 : 7 - day;
  d.setDate(d.getDate() + daysUntilSunday);
  return endOfDay(d);
}

/** Dernier jour du mois 23h59:59 */
function getMonthEnd(ref: Date): Date {
  return new Date(ref.getFullYear(), ref.getMonth() + 1, 0, 23, 59, 59, 999);
}

function getReferenceDate(t: Task, now: Date): Date | null {
  const start = t.start_at ? new Date(t.start_at) : null;
  const end = t.end_at ? new Date(t.end_at) : null;

  if (!start && !end) return null;
  if (start && end) {
    if (start <= now && now <= end) return now;
    if (start > now) return start;
    return end;
  }
  return end ?? start;
}

function groupTasks(tasks: Task[]): Group[] {
  const now = new Date();
  const today = startOfDay(now);

  // Fin de la semaine calendaire en cours (dimanche 23:59:59)
  const weekEnd = getWeekEnd(today);

  // Début et fin de la semaine calendaire suivante (lundi → dimanche)
  const nextWeekStart = new Date(weekEnd);
  nextWeekStart.setDate(weekEnd.getDate() + 1);
  nextWeekStart.setHours(0, 0, 0, 0);
  const nextWeekEnd = new Date(nextWeekStart);
  nextWeekEnd.setDate(nextWeekStart.getDate() + 6);
  nextWeekEnd.setHours(23, 59, 59, 999);

  // Fin du mois calendaire en cours
  const monthEnd = getMonthEnd(today);

  // Mois calendaire suivant
  const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1, 0, 0, 0, 0);
  const nextMonthEnd = getMonthEnd(nextMonthStart);

  const groups: Group[] = [
    { key: 'overdue',    label: '⏰ En retard',          tasks: [] },
    { key: 'today',      label: "Aujourd'hui",          tasks: [] },
    { key: 'tomorrow',   label: 'Demain',               tasks: [] },
    { key: 'this_week',  label: 'Cette semaine',        tasks: [] },
    { key: 'next_week',  label: 'La semaine prochaine', tasks: [] },
    { key: 'this_month', label: 'Ce mois-ci',           tasks: [] },
    { key: 'next_month', label: 'Le mois prochain',     tasks: [] },
    { key: 'later',      label: 'Plus tard',            tasks: [] },
    { key: 'none',       label: 'Sans échéance',        tasks: [] },
  ];

  for (const t of tasks) {
    if (t.status === 'done') continue;
    const ref = getReferenceDate(t, now);
    if (!ref) {
      groups[8].tasks.push(t);
      continue;
    }

    const diff = daysBetween(now, ref);

    if (diff < 0) {
      groups[0].tasks.push(t);
    } else if (diff === 0) {
      groups[1].tasks.push(t);
    } else if (diff === 1) {
      groups[2].tasks.push(t);
    } else if (ref <= weekEnd) {
      groups[3].tasks.push(t);
    } else if (ref >= nextWeekStart && ref <= nextWeekEnd) {
      groups[4].tasks.push(t);
    } else if (ref <= monthEnd) {
      groups[5].tasks.push(t);
    } else if (ref >= nextMonthStart && ref <= nextMonthEnd) {
      groups[6].tasks.push(t);
    } else {
      groups[7].tasks.push(t);
    }
  }

  for (const g of groups) {
    g.tasks.sort((a, b) => {
      const da = a.end_at ?? a.start_at ?? '9999';
      const db = b.end_at ?? b.start_at ?? '9999';
      return da.localeCompare(db);
    });
  }

  return groups.filter((g) => g.tasks.length > 0);
}

export default function TaskListView({ hiddenListIds }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [linksOpen, setLinksOpen] = useState(false);
  const [linksTask, setLinksTask] = useState<Task | null>(null);

  const editing = editingId
    ? tasks.find((t) => t.id === editingId) ?? null
    : null;

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    const now = new Date();
    const from = new Date(now.getFullYear() - 5, 0, 1).toISOString();
    const to   = new Date(now.getFullYear() + 10, 0, 1).toISOString();
    const rows = await api.listRange(from, to);
    setTasks(rows);
    if (!silent) setLoading(false);
  };

  useEffect(() => {
    load();
    let unlisten: (() => void) | undefined;
    api.onChanged(() => load(true)).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      load(true);
    }, 20000);
    return () => clearInterval(interval);
  }, []);

  const visibleTasks = tasks.filter(
    (t) => !t.list_id || !hiddenListIds.has(t.list_id)
  );
  const groups = groupTasks(visibleTasks);

  const cycleStatus = async (t: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = nextStatus[t.status];
    setTasks((prev) =>
      prev.map((x) => (x.id === t.id ? { ...x, status: next } : x))
    );
    try {
      const updated = await api.setStatus(t.id, next);
      setTasks((prev) =>
        prev.map((x) => (x.id === updated.id ? updated : x))
      );
    } catch (err) {
      setTasks((prev) =>
        prev.map((x) => (x.id === t.id ? { ...x, status: t.status } : x))
      );
      console.error('setStatus failed:', err);
    }
  };

  const openEdit = (t: Task) => {
    setEditingId(t.id);
    setModalOpen(true);
  };

  const openCreate = () => {
    setEditingId(null);
    setModalOpen(true);
  };

  const openLinks = (t: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    setLinksTask(t);
    setLinksOpen(true);
  };

  const linkCount = (t: Task) =>
    Array.isArray(t.links) ? t.links.length : 0;

  return (
    <>
      <div className="list-toolbar">
        <button
          type="button"
          className="btn-add"
          onClick={openCreate}
          title="Nouvelle tâche"
        >
          + Ajouter
        </button>
      </div>

      {loading ? (
        <div className="list-empty">Chargement…</div>
      ) : groups.length === 0 ? (
        <div className="list-empty">
          <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
          <div>Aucune tâche en cours</div>
        </div>
      ) : (
        <div className="task-list">
          {groups.map((g) => (
            <div key={g.key} className="task-group">
              <div className="task-group-header">
                <span>{g.label}</span>
                <span className="task-group-count">{g.tasks.length}</span>
              </div>
              {g.tasks.map((t) => {
                const count = linkCount(t);
                const badge = statusBadgeStyle[t.status];
                return (
                  <div
                    key={t.id}
                    className={`task-item status-${t.status}`}
                    onClick={() => openEdit(t)}
                    title="Cliquer pour modifier"
                  >
                    <span
                      className="task-dot"
                      style={{ background: statusColor[t.status] }}
                    />
                    <div className="task-body">
                      <div className="task-title">{t.title}</div>
                      <div className="task-meta">
                        {formatTaskDate(t) && <span>{formatTaskDate(t)}</span>}
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`task-folder-btn ${count > 0 ? 'has-links' : ''}`}
                      onClick={(e) => openLinks(t, e)}
                      title={
                        count > 0
                          ? `${count} document(s) — cliquer pour ouvrir`
                          : 'Ajouter des documents'
                      }
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>
                      {count > 0 && (
                        <span className="task-folder-count">{count}</span>
                      )}
                    </button>
                    <div className="task-right">
                      <span
                        className="task-status-badge"
                        style={{
                          backgroundColor: badge.bg,
                          color: badge.text,
                          borderColor: badge.border,
                        }}
                        onClick={(e) => cycleStatus(t, e)}
                        title="Changer le statut"
                      >
                        {statusLabel[t.status]}
                      </span>
                      {t.list_name && (
                        <span className="task-list-tag">
                          <span
                            className="task-list-dot"
                            style={{ background: t.list_color ?? '#c4b5fd' }}
                          />
                          {t.list_name}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      <TaskModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={load}
        task={editing}
      />

      <TaskLinksModal
        open={linksOpen}
        onClose={() => setLinksOpen(false)}
        task={linksTask}
        onUpdated={() => load(true)}
      />
    </>
  );
}