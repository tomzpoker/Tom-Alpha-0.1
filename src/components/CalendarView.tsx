import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import multiMonthPlugin from '@fullcalendar/multimonth';
import interactionPlugin from '@fullcalendar/interaction';
import frLocale from '@fullcalendar/core/locales/fr';
import { useEffect, useRef, useState } from 'react';
import { api, type TaskStatus } from '../lib/api';

interface Props {
  hiddenListIds: Set<string>;
}

type View = 'dayGridMonth' | 'multiMonthQuarter' | 'multiMonthYear';

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

export default function CalendarView({ hiddenListIds }: Props) {
  const [view, setView] = useState<View>('dayGridMonth');
  const [events, setEvents] = useState<any[]>([]);
  const calendarRef = useRef<FullCalendar>(null);

  const load = async () => {
    const now = new Date();
    const from = new Date(now.getFullYear() - 5, 0, 1).toISOString();
    const to   = new Date(now.getFullYear() + 10, 0, 1).toISOString();
    const rows = await api.listRange(from, to);

    const visible = rows.filter(
      (t) => !t.list_id || !hiddenListIds.has(t.list_id)
    );

    setEvents(
      visible.map((t) => {
        let start = t.start_at ?? t.end_at ?? undefined;
        let end: string | undefined = undefined;

        // Si on a un vrai start ET un vrai end différents → événement multi-jours
        if (t.start_at && t.end_at) {
          const sd = new Date(t.start_at);
          const ed = new Date(t.end_at);
          const sameDay =
            sd.getFullYear() === ed.getFullYear() &&
            sd.getMonth() === ed.getMonth() &&
            sd.getDate() === ed.getDate();

          if (!sameDay) {
            start = t.start_at;
            // FullCalendar : end est EXCLUSIF pour les all_day → +1 jour
            if (t.all_day) {
              const plus1 = new Date(ed);
              plus1.setDate(plus1.getDate() + 1);
              end = plus1.toISOString();
            } else {
              end = t.end_at;
            }
          }
        }

        return {
          id: t.id,
          title: t.title,
          start,
          end,
          allDay: t.all_day,
          backgroundColor: statusColor[t.status],
          borderColor: statusColor[t.status],
          extendedProps: { status: t.status },
        };
      })
    );
  };

  useEffect(() => {
    load();
    let unlisten: (() => void) | undefined;
    api.onChanged(load).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [hiddenListIds]);

  useEffect(() => {
    const forceResize = () => calendarRef.current?.getApi().updateSize();
    const t1 = setTimeout(forceResize, 0);
    const t2 = setTimeout(forceResize, 80);
    const t3 = setTimeout(forceResize, 250);
    window.addEventListener('resize', forceResize);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      window.removeEventListener('resize', forceResize);
    };
  }, [view, hiddenListIds]);

  return (
    <div className="calendar-container">
      <div className="view-tabs">
        <button
          className={view === 'dayGridMonth' ? 'active' : ''}
          onClick={() => setView('dayGridMonth')}
        >
          Mois
        </button>
        <button
          className={view === 'multiMonthQuarter' ? 'active' : ''}
          onClick={() => setView('multiMonthQuarter')}
        >
          Trimestre
        </button>
        <button
          className={view === 'multiMonthYear' ? 'active' : ''}
          onClick={() => setView('multiMonthYear')}
        >
          Année
        </button>
      </div>

      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, multiMonthPlugin, interactionPlugin]}
        initialView={view}
        key={view}
        locale={frLocale}
        views={{
          multiMonthQuarter: {
            type: 'multiMonth',
            duration: { months: 3 },
            multiMonthMaxColumns: 1,
          },
          multiMonthYear: {
            type: 'multiMonth',
            duration: { months: 12 },
            multiMonthMaxColumns: 1,
          },
        }}
        events={events}
        editable
        displayEventTime={false}
        eventDisplay="block"
        dayMaxEvents={3}
        eventClick={async (info) => {
          const current = info.event.extendedProps.status as TaskStatus;
          await api.setStatus(info.event.id, nextStatus[current]);
        }}
        eventDrop={async (info) => {
          const d = info.event.start?.toISOString() ?? null;
          await api.update(info.event.id, { start_at: d, end_at: d });
        }}
        headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
        height="100%"
      />
    </div>
  );
}