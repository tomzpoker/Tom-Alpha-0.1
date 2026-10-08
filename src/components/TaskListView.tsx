import { useEffect, useState } from 'react';
import { save, open } from '@tauri-apps/plugin-dialog';
import { api, type Task, type TaskStatus } from '../lib/api';
import TaskModal from './TaskModal';

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
    { key: 'overdue',  label: '⏰ En retard',    tasks: [] },
    { key: 'today',    label: "Aujourd'hui",    tasks: [] },
    { key: 'tomorrow', label: 'Demain',         tasks: [] },
    { key: 'week',     label: 'Cette semaine',  tasks: [] },
    { key: 'month',    label: 'Ce mois-ci',     tasks: [] },
    { key: 'later',    label: 'Plus tard',      tasks: [] },
    { key: 'none',     label: 'Sans échéance',  tasks: [] },
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
    else if (diff <= 31) groups[4].tasks.push(t);
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

  if (start && end) {
    const diffDays = daysBetween(start, end);
    if (diffDays > 0) {
      const startStr = start.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'short',
      });
      const endStr = end.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'short',
      });
      return `Du ${startStr} au ${endStr}`;
    }
  }

  const ref = end ?? start;
  if (!ref) return '';
  const diff = daysBetween(now, ref);
  const time = t.all_day
    ? ''
    : ` à ${ref.getHours().toString().padStart(2, '0')}h${ref
        .getMinutes()
        .toString()
        .padStart(2, '0')}`;

  if (diff === 0) return `Aujourd'hui${time}`;
  if (diff === 1) return `Demain${time}`;
  if (diff === -1) return `Hier${time}`;
  if (diff < 0) return `Il y a ${Math.abs(diff)} j${time}`;
  if (diff < 7) return `Dans ${diff} j${time}`;

  return (
    ref.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: ref.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    }) + time
  );
}

export default function TaskListView({ hiddenListIds }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

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

  // Polling silencieux toutes les 20s
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

  const handleExport = async () => {
    try {
      const path = await save({
        defaultPath: `tasks-export-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (!path) return;
      const count = await api.exportToFile(path);
      alert(`Export réussi : ${count} tâche(s) exportée(s).`);
    } catch (e) {
      alert('Erreur export : ' + e);
    }
  };

  const handleImport = async () => {
    try {
      const path = await open({
        multiple: false,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (!path || typeof path !== 'string') return;
      if (
        !confirm(
          'Importer ce fichier ? Les tâches existantes seront conservées, seules les nouvelles seront ajoutées.'
        )
      )
        return;
      const report = await api.importFromFile(path);
      alert(
        `Import terminé :\n${report.tasks_inserted} tâche(s)\n${report.lists_inserted} liste(s)`
      );
      await load(true);
    } catch (e) {
      alert('Erreur import : ' + e);
    }
  };

  return (
    <>
      <div className="list-toolbar">
        <button className="btn-add" onClick={openCreate} title="Nouvelle tâche">
          + Ajouter
        </button>
        <button
          className="btn-import"
          onClick={handleImport}
          title="Importer depuis un fichier JSON"
        >
          📥 Importer
        </button>
        <button
          className="btn-export"
          onClick={handleExport}
          title="Exporter vers un fichier JSON"
        >
          📤 Exporter
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
              {g.tasks.map((t) => (
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
              ))}
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
    </>
  );
}