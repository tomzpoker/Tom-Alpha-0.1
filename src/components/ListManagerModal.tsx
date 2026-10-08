import { useEffect, useState } from 'react';
import { save as saveDialog, open as openDialog } from '@tauri-apps/plugin-dialog';
import { api, type TaskList } from '../lib/api';

interface Props {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}

/** Palette pastel — 9 couleurs douces, bien réparties dans le spectre */
const PRESET_COLORS = [
  '#f9a8d4', // Rose pastel
  '#fca5a5', // Corail pastel
  '#fdba74', // Pêche pastel
  '#fde68a', // Citron pastel
  '#a7f3d0', // Menthe pastel
  '#99f6e4', // Aqua pastel
  '#bae6fd', // Ciel pastel
  '#c4b5fd', // Lavande pastel
  '#f0abfc', // Orchidée pastel
];

export default function ListManagerModal({ open, onClose, onChanged }: Props) {
  const [lists, setLists] = useState<TaskList[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#f9a8d4');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setColor('#f9a8d4');
    setError(null);
  };

  const load = async () => {
    setLists(await api.lists());
  };

  useEffect(() => {
    if (!open) return;
    load();
    resetForm();
    setInfoMsg(null);
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

  const handleExport = async () => {
    setInfoMsg(null);
    setError(null);
    try {
      const path = await saveDialog({
        defaultPath: `tasks-export-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (!path) return;
      setBusy(true);
      const count = await api.exportToFile(path);
      setInfoMsg(`✓ Export réussi : ${count} tâche(s) sauvegardée(s).`);
      setTimeout(() => setInfoMsg(null), 5000);
    } catch (e) {
      setError('Erreur export : ' + e);
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    setInfoMsg(null);
    setError(null);
    try {
      const path = await openDialog({
        multiple: false,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (!path || typeof path !== 'string') return;
      if (
        !confirm(
          'Importer ce fichier ? Les données existantes seront conservées, seules les nouvelles seront ajoutées.'
        )
      )
        return;
      setBusy(true);
      const report = await api.importFromFile(path);
      setInfoMsg(
        `✓ Import terminé : ${report.tasks_inserted} tâche(s), ${report.lists_inserted} liste(s).`
      );
      await load();
      onChanged();
      setTimeout(() => setInfoMsg(null), 5000);
    } catch (e) {
      setError('Erreur import : ' + e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>⚙ Paramètres</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {/* ============================ */}
          {/* Section : Listes               */}
          {/* ============================ */}
          <div className="settings-section">
            <div className="settings-section-title">Listes</div>

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

          {/* ============================ */}
          {/* Section : Sauvegarde           */}
          {/* ============================ */}
          <div className="settings-section">
            <div className="settings-section-title">Sauvegarde</div>

            <p className="settings-hint">
              Les données sont automatiquement synchronisées dans le cloud.
              Cette section permet de faire une copie manuelle (backup) ou de
              restaurer un fichier exporté.
            </p>

            <div className="settings-actions">
              <button
                className="btn-secondary settings-action-btn"
                onClick={handleExport}
                disabled={busy}
              >
                📤 Exporter mes données
              </button>
              <button
                className="btn-secondary settings-action-btn"
                onClick={handleImport}
                disabled={busy}
              >
                📥 Importer un fichier
              </button>
            </div>

            {infoMsg && <div className="settings-info">{infoMsg}</div>}
          </div>

          {error && <div className="modal-error">{error}</div>}
        </div>
      </div>
    </div>
  );
}