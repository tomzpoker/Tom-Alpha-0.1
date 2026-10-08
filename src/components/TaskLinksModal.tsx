import { useEffect, useRef, useState } from 'react';
import { openUrl, openPath } from '@tauri-apps/plugin-opener';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { api, type Task, type TaskLink } from '../lib/api';

interface Props {
  open: boolean;
  onClose: () => void;
  task: Task | null;
  onUpdated: () => void;
}

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function basename(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

function extOf(filename: string): string {
  const b = basename(filename);
  const idx = b.lastIndexOf('.');
  if (idx < 0) return '';
  return b.slice(idx + 1).toLowerCase();
}

/** Icône selon le type de fichier */
function fileIcon(filename: string): string {
  const ext = extOf(filename);
  const map: Record<string, string> = {
    // Documents
    pdf: '📕',
    doc: '📘', docx: '📘', odt: '📘', rtf: '📘', pages: '📘',
    xls: '📗', xlsx: '📗', ods: '📗', csv: '📗', numbers: '📗',
    ppt: '📙', pptx: '📙', odp: '📙', key: '📙',
    txt: '📄', md: '📝', log: '📄',
    // Images
    jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', bmp: '🖼️',
    svg: '🖼️', webp: '🖼️', ico: '🖼️', tif: '🖼️', tiff: '🖼️', heic: '🖼️',
    // Audio
    mp3: '🎵', wav: '🎵', flac: '🎵', ogg: '🎵', m4a: '🎵', aac: '🎵',
    // Vidéo
    mp4: '🎬', mov: '🎬', avi: '🎬', mkv: '🎬', webm: '🎬', wmv: '🎬',
    // Archives
    zip: '🗜️', rar: '🗜️', '7z': '🗜️', tar: '🗜️', gz: '🗜️', bz2: '🗜️',
    // Code / Data
    js: '💻', ts: '💻', tsx: '💻', jsx: '💻',
    py: '💻', rs: '💻', go: '💻', java: '💻', c: '💻', cpp: '💻', h: '💻',
    html: '💻', css: '💻', scss: '💻', sh: '💻', bat: '💻', ps1: '💻',
    json: '📋', xml: '📋', yaml: '📋', yml: '📋', toml: '📋', ini: '📋',
    // Base de données
    sql: '🗄️', db: '🗄️', sqlite: '🗄️',
    // Exécutables
    exe: '⚙️', msi: '⚙️', cmd: '⚙️', dll: '⚙️',
    // Design
    psd: '🎨', ai: '🎨', sketch: '🎨', fig: '🎨', xd: '🎨',
    // Autres
    iso: '💿', dmg: '💿',
  };
  return map[ext] ?? '📄';
}

/** Petit badge de type (affiché sous le titre) */
function typeBadge(filename: string): string {
  const ext = extOf(filename);
  if (!ext) return 'FICHIER';
  return ext.toUpperCase().slice(0, 5);
}

function safeFilename(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
}

export default function TaskLinksModal({ open, onClose, task, onUpdated }: Props) {
  const [links, setLinks] = useState<TaskLink[]>([]);
  const [showUrlForm, setShowUrlForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [urlValue, setUrlValue] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const [saving, setSaving] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [flash, setFlash] = useState(false);
  const [zipMsg, setZipMsg] = useState<string | null>(null);

  const linksRef = useRef(links);
  useEffect(() => {
    linksRef.current = links;
  }, [links]);

  useEffect(() => {
    if (!open || !task) return;
    setLinks(Array.isArray(task.links) ? task.links : []);
    setShowUrlForm(false);
    setEditingId(null);
    setUrlValue('');
    setTitle('');
    setDescription('');
    setError(null);
    setDragOver(false);
    setFlash(false);
    setZipMsg(null);
  }, [open, task]);

  const persist = async (next: TaskLink[]) => {
    setSaving(true);
    try {
      await api.updateLinks(task!.id, next);
      setLinks(next);
      onUpdated();
    } catch (e) {
      setError('Erreur : ' + e);
    } finally {
      setSaving(false);
    }
  };

  // Drag & drop — actif sauf si édition ou formulaire URL ouvert
  useEffect(() => {
    if (!open) return;
    if (editingId || showUrlForm) return;

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === 'over') {
          setDragOver(true);
        } else if (event.payload.type === 'leave') {
          setDragOver(false);
        } else if (event.payload.type === 'drop') {
          setDragOver(false);
          const paths = event.payload.paths;
          if (paths && paths.length > 0) {
            const file = paths[0];
            const newLink: TaskLink = {
              id: genId(),
              kind: 'file',
              url: file,
              title: basename(file),
            };
            persist([...linksRef.current, newLink]).then(() => {
              setFlash(true);
              setTimeout(() => setFlash(false), 1500);
            });
          }
        }
      })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [open, editingId, showUrlForm]);

  if (!open || !task) return null;

  const resetForm = () => {
    setShowUrlForm(false);
    setEditingId(null);
    setUrlValue('');
    setTitle('');
    setDescription('');
    setError(null);
  };

  const handleBrowse = async () => {
    try {
      const picked = await openDialog({ multiple: false });
      if (!picked || typeof picked !== 'string') return;
      const newLink: TaskLink = {
        id: genId(),
        kind: 'file',
        url: picked,
        title: basename(picked),
      };
      await persist([...links, newLink]);
      setFlash(true);
      setTimeout(() => setFlash(false), 1500);
    } catch (e) {
      setError('Erreur sélection fichier : ' + e);
    }
  };

  const handleAddUrl = async () => {
    if (!urlValue.trim()) {
      setError("L'URL est obligatoire.");
      return;
    }
    let normalized = urlValue.trim();
    if (!/^https?:\/\//i.test(normalized) && !/^mailto:/i.test(normalized)) {
      normalized = 'https://' + normalized;
    }
    const newLink: TaskLink = {
      id: genId(),
      kind: 'url',
      url: normalized,
      title: title.trim() || normalized,
      description: description.trim() || undefined,
    };
    await persist([...links, newLink]);
    resetForm();
  };

  const handleEditSave = async () => {
    if (!editingId) return;
    let normalized = urlValue.trim();
    const existing = links.find((l) => l.id === editingId);
    if (existing && existing.kind === 'url' && !/^https?:\/\//i.test(normalized) && !/^mailto:/i.test(normalized)) {
      normalized = 'https://' + normalized;
    }
    const next = links.map((l) =>
      l.id === editingId
        ? {
            ...l,
            url: normalized,
            title: title.trim() || normalized,
            description: description.trim() || undefined,
          }
        : l
    );
    await persist(next);
    resetForm();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce document ?')) return;
    await persist(links.filter((l) => l.id !== id));
  };

  const startEdit = (l: TaskLink) => {
    setEditingId(l.id);
    setShowUrlForm(false);
    setTitle(l.title);
    setUrlValue(l.url);
    setDescription(l.description ?? '');
    setError(null);
  };

  const handleOpen = async (l: TaskLink) => {
    try {
      if (l.kind === 'file') await openPath(l.url);
      else await openUrl(l.url);
    } catch (e) {
      setError("Impossible d'ouvrir : " + e);
    }
  };

  const handleExportZip = async () => {
    if (!task || links.length === 0) return;
    try {
      const defaultName = `${safeFilename(task.title)}.zip`;
      const path = await saveDialog({
        defaultPath: defaultName,
        filters: [{ name: 'Archive ZIP', extensions: ['zip'] }],
      });
      if (!path) return;

      setZipping(true);
      setZipMsg(null);
      setError(null);

      const count = await api.zipTaskLinks(task.id, path);

      const fileCount = links.filter((l) => l.kind === 'file').length;
      const urlCount = links.filter((l) => l.kind === 'url').length;
      const parts: string[] = [];
      parts.push(`${count}/${fileCount} fichier(s) local(aux)`);
      if (urlCount > 0) parts.push(`${urlCount} lien(s) dans liens.txt`);

      setZipMsg(`✓ ZIP créé — ${parts.join(', ')}`);
      setTimeout(() => setZipMsg(null), 4000);
    } catch (e) {
      setError('Erreur ZIP : ' + e);
    } finally {
      setZipping(false);
    }
  };

  const hasLinks = links.length > 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card task-links-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>📁 Documents — {task.title}</h2>
          <div className="modal-header-actions">
            {hasLinks && (
              <button
                type="button"
                className="modal-icon-btn"
                onClick={handleExportZip}
                disabled={zipping}
                title="Exporter tous les fichiers en ZIP"
              >
                {zipping ? (
                  <span style={{ fontSize: 12 }}>…</span>
                ) : (
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
                    <path d="M21 8v13H3V8" />
                    <path d="M1 3h22v5H1z" />
                    <path d="M10 12h4" />
                  </svg>
                )}
              </button>
            )}
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="modal-body">
          {zipMsg && <div className="zip-success-msg">{zipMsg}</div>}

          {hasLinks && (
            <div className="links-list">
              {links.map((l) => (
                <div
                  key={l.id}
                  className={`link-item ${editingId === l.id ? 'editing' : ''}`}
                >
                  <button
                    type="button"
                    className="link-open"
                    onClick={() => handleOpen(l)}
                    title={
                      l.kind === 'file'
                        ? "Ouvrir avec l'application par défaut"
                        : 'Ouvrir dans le navigateur'
                    }
                  >
                    <span className="link-icon">
                      {l.kind === 'file' ? fileIcon(l.url) : '🔗'}
                    </span>
                    <span className="link-text">
                      <span className="link-title">{l.title}</span>
                      {l.description && (
                        <span className="link-desc">{l.description}</span>
                      )}
                      <span className="link-url">
                        {l.kind === 'file'
                          ? `${typeBadge(l.url)} · ${basename(l.url)}`
                          : l.url}
                      </span>
                    </span>
                  </button>
                  <div className="link-actions">
                    <button
                      className="icon-btn"
                      onClick={() => startEdit(l)}
                      title="Modifier"
                    >
                      ✎
                    </button>
                    <button
                      className="icon-btn icon-btn-danger"
                      onClick={() => handleDelete(l.id)}
                      title="Supprimer"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {editingId && (
            <div className="list-manager-form">
              <div className="list-manager-form-title">Modifier le document</div>

              <label className="field">
                <span>
                  {links.find((l) => l.id === editingId)?.kind === 'file'
                    ? 'Chemin du fichier'
                    : 'URL'}{' '}
                  *
                </span>
                <input
                  type="text"
                  value={urlValue}
                  onChange={(e) => setUrlValue(e.target.value)}
                  placeholder="https://…"
                />
              </label>
              <label className="field">
                <span>Nom du document</span>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex : Contrat signé 2026"
                />
              </label>
              <label className="field">
                <span>Description</span>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optionnel"
                />
              </label>

              {error && <div className="modal-error">{error}</div>}

              <div className="list-manager-form-actions">
                <button className="btn-secondary" onClick={resetForm}>
                  Annuler
                </button>
                <div style={{ flex: 1 }} />
                <button
                  className="btn-primary"
                  onClick={handleEditSave}
                  disabled={saving || !urlValue.trim()}
                >
                  {saving ? '…' : 'Enregistrer'}
                </button>
              </div>
            </div>
          )}

          {showUrlForm && !editingId && (
            <div className="list-manager-form">
              <div className="list-manager-form-title">Ajouter un lien web</div>

              <label className="field">
                <span>URL *</span>
                <input
                  type="text"
                  value={urlValue}
                  onChange={(e) => setUrlValue(e.target.value)}
                  placeholder="https://docs.google.com/..."
                  autoFocus
                />
              </label>
              <label className="field">
                <span>Nom du document</span>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex : Contrat signé 2026"
                />
              </label>
              <label className="field">
                <span>Description</span>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optionnel"
                />
              </label>

              {error && <div className="modal-error">{error}</div>}

              <div className="list-manager-form-actions">
                <button className="btn-secondary" onClick={resetForm}>
                  Annuler
                </button>
                <div style={{ flex: 1 }} />
                <button
                  className="btn-primary"
                  onClick={handleAddUrl}
                  disabled={saving || !urlValue.trim()}
                >
                  {saving ? '…' : 'Ajouter'}
                </button>
              </div>
            </div>
          )}

          {!editingId && !showUrlForm && (
            <div
              className={`file-drop-zone ${dragOver ? 'drag-over' : ''} ${
                flash ? 'flash-success' : ''
              } ${hasLinks ? 'compact' : ''}`}
            >
              {flash ? (
                <>
                  <div className="file-drop-icon">✅</div>
                  <div className="file-drop-hint" style={{ color: '#10b981' }}>
                    Document ajouté
                  </div>
                </>
              ) : (
                <>
                  <div className="file-drop-icon">📥</div>
                  <div className="file-drop-hint">
                    {hasLinks
                      ? 'Glissez-déposez un autre fichier ici'
                      : 'Glissez-déposez un fichier ici'}
                  </div>
                  <div className="file-drop-hint-sub">
                    Ajout automatique au dépôt
                  </div>
                  <div className="file-drop-actions">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={handleBrowse}
                    >
                      Parcourir…
                    </button>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => {
                        setShowUrlForm(true);
                        setTitle('');
                        setUrlValue('');
                        setDescription('');
                        setError(null);
                      }}
                    >
                      ou coller un lien web
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}