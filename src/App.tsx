import { useCallback, useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import CalendarView from './components/CalendarView';
import TaskListView from './components/TaskListView';
import ListFilter from './components/ListFilter';
import ListManagerModal from './components/ListManagerModal';
import { api, type TaskList } from './lib/api';
import './App.css';

type Mode = 'list' | 'calendar';

export default function App() {
  const [mode, setMode] = useState<Mode>('list');
  const [lists, setLists] = useState<TaskList[]>([]);
  const [managerOpen, setManagerOpen] = useState(false);

  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('hiddenListIds');
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });

  const win = getCurrentWindow();

  useEffect(() => {
    localStorage.setItem('hiddenListIds', JSON.stringify([...hiddenIds]));
  }, [hiddenIds]);

  const loadLists = useCallback(async () => {
    try {
      setLists(await api.lists());
    } catch {
      /* DB pas prête, on ignore */
    }
  }, []);

  useEffect(() => {
    loadLists();
    let unlisten: (() => void) | undefined;
    api.onChanged(loadLists).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [loadLists]);

  // Polling silencieux toutes les 20s
  useEffect(() => {
    const interval = setInterval(() => {
      loadLists();
    }, 20000);
    return () => clearInterval(interval);
  }, [loadLists]);

  useEffect(() => {
    const unlisten = win.onFocusChanged(({ payload: focused }) => {
      if (focused) win.setSkipTaskbar(true).catch(() => {});
    });
    return () => {
      unlisten.then((fn) => fn()).catch(() => {});
    };
  }, []);

  const minimize = async () => {
    try {
      await win.setSkipTaskbar(false);
      await win.minimize();
    } catch (e) {
      console.error('minimize error', e);
    }
  };

  const hide = () => win.hide();

  const toggleList = (id: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="app" data-mode={mode}>
      <div className="titlebar" data-tauri-drag-region>
        <span className="title" data-tauri-drag-region>📅 Mes tâches</span>
        <div className="titlebar-actions">
          <button
            className="win-btn"
            onClick={minimize}
            title="Réduire"
            aria-label="Réduire"
          >
            <svg width="10" height="10" viewBox="0 0 10 10">
              <rect x="1" y="4.5" width="8" height="1" fill="currentColor" />
            </svg>
          </button>
          <button
            className="win-btn win-btn-close"
            onClick={hide}
            title="Masquer"
            aria-label="Masquer"
          >
            <svg width="10" height="10" viewBox="0 0 10 10">
              <path
                d="M1 1 L9 9 M9 1 L1 9"
                stroke="currentColor"
                strokeWidth="1.2"
                fill="none"
              />
            </svg>
          </button>
        </div>
      </div>

      <div className="mode-switch">
        <button
          className={mode === 'list' ? 'active' : ''}
          onClick={() => setMode('list')}
        >
          ☰ Liste
        </button>
        <button
          className={mode === 'calendar' ? 'active' : ''}
          onClick={() => setMode('calendar')}
        >
          📅 Calendrier
        </button>
      </div>

      <ListFilter
        lists={lists}
        hiddenIds={hiddenIds}
        onToggle={toggleList}
        onManage={() => setManagerOpen(true)}
      />

      <div className="content">
        {mode === 'list' ? (
          <TaskListView hiddenListIds={hiddenIds} />
        ) : (
          <CalendarView hiddenListIds={hiddenIds} />
        )}
      </div>

      <ListManagerModal
        open={managerOpen}
        onClose={() => setManagerOpen(false)}
        onChanged={loadLists}
      />
    </div>
  );
}