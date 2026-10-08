import { useEffect, useState } from 'react';
import { api, type Task, type TaskStatus } from '../lib/api';
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
  todo: '#3b82f6',
  in_progress: '#f59e0b',
  done: '#10b981',
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

function daysBetween(a: Date, b: Date) {
  return Math.floor(
    (startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000
  );
}

/** "10h00", "10h30" — toujours 2 chiffres pour les minutes */
function formatTime(d: Date): string {
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}h${m}`;
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
  const groups: Group[] = [
    { key: 'overdue',  label: '⏰ En retard',        tasks: [] },
    { key: 'today',    label: "Aujourd'hui",        tasks: [] },
    { key: 'tomorrow', label: 'Demain',             tasks: [] },
    { key: 'week',     label: 'Cette semaine',      tasks: [] },
    { key: 'month',    label: '30 prochains jours', tasks: [] },
    { key: 'later',    label: 'Plus tard',          tasks: [] },
    { key: 'none',     label: 'Sans échéance',      tasks: [] },
  ];

  for (const t of tasks) {
    if (t.status === 'done') continue;
    const ref = getReferenceDate(t, now);
    if (!ref) {
      groups[6].tasks.push(t);
      continue;
    }
    const diff = daysBetween(now, ref);
    if (diff < 0) groups[0].tasks.push(t);
    else if (diff === 0) groups[1].tasks.push(t);
    else if (diff === 1) groups[2].tasks.push(t);
    else if (diff <= 7) groups[3].tasks.push(t);
    else if (diff <= 30) groups[4].tasks.push(t);
    else groups[5].tasks.push(t);
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

function formatDate(t: Task): string {
  const start = t.start_at ? new Date(t.start_at) : null;
  const end = t.end_at ? new Date(t.end_at) : null;
  const now = new Date();

  if (!start && !end) return '';

  // ============================================================
  // Cas multi-jours
  // ============================================================
  if (start && end) {
    const diffDays = daysBetween(start, end);
    if (diffDays > 0) {
      const startDay = start.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'short',
      });
      const endDay = end.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'short',
      });

      if (t.all_day) {
        return `Du ${startDay} au ${endDay}`;
      }
      return `Du ${startDay} au ${endDay} → ${formatTime(end)}`;
    }
  }

  // ============================================================
  // Cas même jour
  // ============================================================
  const ref = end ?? start;
  if (!ref) return '';

  const diff = daysBetween(now, ref);

  let dayLabel: string;
  if (diff === 0) dayLabel = "Aujourd'hui";
  else if (diff === 1) dayLabel = 'Demain';
  else if (diff === -1) dayLabel = 'Hier';
  else if (diff < 0) dayLabel = `Il y a ${Math.abs(diff)} j`;
  else if (diff < 7) dayLabel = `Dans ${diff} j`;
  else {
    dayLabel = ref.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: ref.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  }

  if (t.all_day) return dayLabel;

  if (start && end) {
    return `${dayLabel}, ${formatTime(start)} → ${formatTime(end)}`;
  }

  return `${dayLabel}, ${formatTime(ref)}`;
}

export default function TaskListView({ hiddenListIds }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [linksOpen, setLinksOpen] = useState(false);
  const [linksTask, setLinksTask] = useState<Task | null>(null);

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
    await api.setStatus(t.id, nextStatus[t.status]);
  };

  const openEdit = (t: Task) => {
    setEditing(t);
    setModalOpen(true);
  };

  const openCreate = () => {
    setEditing(null);
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
                        {formatDate(t) && <span>{formatDate(t)}</span>}
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
                          color: statusColor[t.status],
                          borderColor: statusColor[t.status],
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
                            style={{ background: t.list_color ?? '#94a3b8' }}
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