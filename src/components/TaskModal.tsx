import { useEffect, useState } from 'react';
import { api, type Task, type TaskList, type TaskStatus } from '../lib/api';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  task?: Task | null;
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function addHour(localIso: string, hours = 1): string {
  const d = new Date(localIso);
  d.setHours(d.getHours() + hours);
  return toLocalInput(d.toISOString());
}

export default function TaskModal({ open, onClose, onSaved, task }: Props) {
  const isEdit = !!task;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [listId, setListId] = useState<string>('');
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [lists, setLists] = useState<TaskList[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Charge les listes à l'ouverture
  useEffect(() => {
    if (!open) return;
    api.lists().then(setLists).catch(() => {});
    setError(null);
  }, [open]);

  // Charge les champs depuis la tâche (quand on change de tâche ou qu'on ouvre)
  useEffect(() => {
    if (!open || !task) {
      if (open && !task) {
        // Nouvelle tâche
        const now = new Date();
        const later = new Date(now.getTime() + 3600_000);
        setTitle('');
        setDescription('');
        setListId('');
        setStatus('todo');
        setStartAt(toLocalInput(now.toISOString()));
        setEndAt(toLocalInput(later.toISOString()));
        setAllDay(false);
      }
      return;
    }

    setTitle(task.title);
    setDescription(task.description ?? '');
    setListId(task.list_id ?? '');
    setStatus(task.status);
    setStartAt(task.start_at ? toLocalInput(task.start_at) : '');
    setEndAt(task.end_at ? toLocalInput(task.end_at) : '');
    setAllDay(task.all_day);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id]);

  // ⭐ Si le statut de la tâche change depuis l'extérieur (autre PC, clic sur
  // le badge dans la liste, etc.), on met à jour le dropdown tout seul.
  useEffect(() => {
    if (!open || !task) return;
    setStatus(task.status);
  }, [open, task?.id, task?.status]);

  if (!open) return null;

  const handleStartChange = (value: string) => {
    setStartAt(value);
    setError(null);
    if (!value) return;
    if (!endAt || new Date(endAt) < new Date(value)) {
      if (allDay) setEndAt(value);
      else setEndAt(addHour(value, 1));
    }
  };

  const handleEndChange = (value: string) => {
    if (startAt && value && new Date(value) < new Date(startAt)) {
      setError('La date de fin ne peut pas être antérieure à la date de début.');
      return;
    }
    setError(null);
    setEndAt(value);
  };

  const handleAllDayChange = (checked: boolean) => {
    setAllDay(checked);
    setError(null);
    if (checked) {
      const s = startAt ? startAt.split('T')[0] + 'T00:00' : '';
      const e = endAt ? endAt.split('T')[0] + 'T23:59' : s;
      setStartAt(s);
      setEndAt(e);
    } else {
      const s = startAt ? startAt.split('T')[0] + 'T09:00' : '';
      const e = startAt ? startAt.split('T')[0] + 'T10:00' : '';
      setStartAt(s);
      setEndAt(e);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    if (startAt && endAt && new Date(endAt) < new Date(startAt)) {
      setError('La date de fin ne peut pas être antérieure à la date de début.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        listId: listId || null,
        status,
        startAt: startAt ? new Date(startAt).toISOString() : null,
        endAt: endAt ? new Date(endAt).toISOString() : null,
        allDay,
      };
      if (isEdit && task) {
        await api.saveFull(task.id, payload);
      } else {
        await api.createFull(payload);
      }
      onSaved();
      onClose();
    } catch (e) {
      setError('Erreur : ' + e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!task) return;
    if (!confirm(`Supprimer « ${task.title} » ?`)) return;
    await api.remove(task.id);
    onSaved();
    onClose();
  };

  const endInvalid = !!(
    startAt &&
    endAt &&
    new Date(endAt) < new Date(startAt)
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isEdit ? 'Modifier la tâche' : 'Nouvelle tâche'}</h2>
          <div className="modal-header-actions">
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="modal-body">
          <label className="field">
            <span>Titre *</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              placeholder="Ex : Appeler le client"
            />
          </label>

          <label className="field">
            <span>Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Optionnel"
            />
          </label>

          <div className="modal-row">
            <label className="field">
              <span>Liste</span>
              <select
                value={listId}
                onChange={(e) => setListId(e.target.value)}
              >
                <option value="">— Aucune —</option>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Statut</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
              >
                <option value="todo">À faire</option>
                <option value="in_progress">En cours</option>
                <option value="done">Validé</option>
              </select>
            </label>
          </div>

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => handleAllDayChange(e.target.checked)}
            />
            <span>Toute la journée</span>
          </label>

          <div className="modal-row">
            <label className="field">
              <span>Début</span>
              <input
                type={allDay ? 'date' : 'datetime-local'}
                value={allDay ? startAt.split('T')[0] : startAt}
                onChange={(e) =>
                  handleStartChange(
                    allDay ? e.target.value + 'T00:00' : e.target.value
                  )
                }
              />
            </label>
            <label className="field">
              <span>Fin</span>
              <input
                type={allDay ? 'date' : 'datetime-local'}
                value={allDay ? endAt.split('T')[0] : endAt}
                min={allDay ? startAt.split('T')[0] : startAt}
                onChange={(e) =>
                  handleEndChange(
                    allDay ? e.target.value + 'T23:59' : e.target.value
                  )
                }
                className={endInvalid ? 'input-invalid' : ''}
              />
            </label>
          </div>

          {error && <div className="modal-error">{error}</div>}
        </div>

        <div className="modal-footer">
          {isEdit && (
            <button className="btn-danger" onClick={handleDelete}>
              🗑 Supprimer
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button className="btn-secondary" onClick={onClose}>
            Annuler
          </button>
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={saving || !title.trim() || endInvalid}
          >
            {saving ? '…' : isEdit ? 'Enregistrer' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  );
}