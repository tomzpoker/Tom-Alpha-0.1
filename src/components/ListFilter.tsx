import type { TaskList } from '../lib/api';

interface Props {
  lists: TaskList[];
  hiddenIds: Set<string>;
  onToggle: (id: string) => void;
  onManage: () => void;
}

export default function ListFilter({
  lists,
  hiddenIds,
  onToggle,
  onManage,
}: Props) {
  if (lists.length === 0) {
    return (
      <div className="list-filter-bar">
        <span className="list-filter-empty">Aucune liste</span>
        <button
          className="list-filter-manage"
          onClick={onManage}
          title="Créer une liste"
        >
          ⚙ Gérer
        </button>
      </div>
    );
  }

  return (
    <div className="list-filter-bar">
      {lists.map((l) => {
        const hidden = hiddenIds.has(l.id);
        return (
          <button
            key={l.id}
            className={`list-filter-pill ${hidden ? 'off' : 'on'}`}
            onClick={() => onToggle(l.id)}
            title={hidden ? `Afficher ${l.name}` : `Masquer ${l.name}`}
          >
            <span className="list-filter-dot" style={{ background: l.color }} />
            {l.name}
          </button>
        );
      })}
      <button
        className="list-filter-manage"
        onClick={onManage}
        title="Gérer les listes"
      >
        ⚙
      </button>
    </div>
  );
}