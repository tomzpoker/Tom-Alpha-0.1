import { useEffect, useState } from 'react';
import { api, type TaskList } from '../lib/api';

interface Props {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}

const PRESET_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#14b8a6', '#64748b',
];

export default function ListManagerModal({ open, onClose, onChanged }: Props) {
  const [lists, setLists] = useState<TaskList[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setColor('#3b82f6');
    setError(null);
  };

  const load = async () => {
    setLists(await api.lists());
  };

  useEffect(() => {
    if (!open) return;
    load();
    resetForm();
  }, [open]);

  if (!open) return null;

  const startEdit = (l: TaskList) => {
    setEditingId(l.id);
    setName(l.name);
    setColor(l.color);
    setError(null);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Le nom est requis.');
      return;
    }
    try {
      if (editingId) {
        await api.updateList(editingId, name.trim(), color);
      } else {
        await api.createList(name.trim(), color);
      }
      resetForm();
      await load();
      onChanged();
    } catch (e) {
      setError('Erreur : ' + e);
    }
  };

  const handleDelete = async (l: TaskList) => {
    if (
      !confirm(
        `Supprimer la liste « ${l.name} » ?\n\nLes tâches associées ne seront PAS supprimées, elles perdront juste leur rattachement.`
      )
    )
      return;
    try {
      await api.deleteList(l.id);
      if (editingId === l.id) resetForm();
      await load();
      onChanged();
    } catch (e) {
      setError('Erreur : ' + e);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Gérer les listes</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {lists.length === 0 ? (
            <div className="list-empty-small">
              Aucune liste. Crées-en une ci-dessous.
            </div>
          ) : (
            <div className="list-manager-items">
              {lists.map((l) => (
                <div
                  key={l.id}
                  className={`list-manager-item ${editingId === l.id ? 'editing' : ''}`}
                >
                  <span
                    className="list-manager-dot"
                    style={{ background: l.color }}
                  />
                  <span className="list-manager-name">{l.name}</span>
                  <button
                    className="icon-btn"
                    onClick={() => startEdit(l)}
                    title="Modifier"
                  >
                    ✎
                  </button>
                  <button
                    className="icon-btn icon-btn-danger"
                    onClick={() => handleDelete(l)}
                    title="Supprimer"
                  >
                    🗑
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="list-manager-form">
            <div className="list-manager-form-title">
              {editingId ? 'Modifier la liste' : 'Nouvelle liste'}
            </div>

            <label className="field">
              <span>Nom</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex : GLM, SCI, EXTRAS…"
                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              />
            </label>

            <div className="field">
              <span>Couleur</span>
              <div className="color-picker">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`color-swatch ${color === c ? 'selected' : ''}`}
                    style={{ background: c }}
                    onClick={() => setColor(c)}
                    title={c}
                  />
                ))}
              </div>
            </div>

            {error && <div className="modal-error">{error}</div>}

            <div className="list-manager-form-actions">
              {editingId && (
                <button className="btn-secondary" onClick={resetForm}>
                  Annuler
                </button>
              )}
              <div style={{ flex: 1 }} />
              <button className="btn-primary" onClick={handleSave}>
                {editingId ? 'Enregistrer' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}