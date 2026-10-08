import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import multiMonthPlugin from '@fullcalendar/multimonth';
import interactionPlugin from '@fullcalendar/interaction';
import frLocale from '@fullcalendar/core/locales/fr';
import { useEffect, useRef, useState } from 'react';
import { api, type TaskStatus } from '../lib/api';
import { useZoom } from '../hooks/useZoom';

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

function toMidnight(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export default function CalendarView({ hiddenListIds }: Props) {
  const zoom = useZoom();
  const isLargeZoom = zoom >= 130;

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
        // ---- Cas tâche "toute la journée" ----
        // On normalise start/end à minuit, et on ajoute +1 jour à end
        // car FullCalendar considère end comme EXCLUSIF.
        // Sans ça, une tâche finissant à 23h59 le 12 oct. débordait
        // visuellement sur le 13 oct.
        if (t.all_day) {
          const refStart = t.start_at ?? t.end_at;
          const refEnd = t.end_at ?? t.start_at;
          if (!refStart || !refEnd) return null;

          const sd = toMidnight(new Date(refStart));
          const ed = toMidnight(new Date(refEnd));
          const sameDay = sd.getTime() === ed.getTime();

          const start = sd.toISOString();
          const end = new Date(ed);
          end.setDate(end.getDate() + 1);

          return {
            id: t.id,
            title: t.title,
            start,
            // Si la tâche ne dure qu'un jour, on n'envoie PAS de end :
            // FullCalendar affiche alors une barre d'une seule journée.
            end: sameDay ? undefined : end.toISOString(),
            allDay: true,
            backgroundColor: statusColor[t.status],
            borderColor: statusColor[t.status],
            extendedProps: { status: t.status },
          };
        }

        // ---- Cas tâche horaire ----
        let start = t.start_at ?? t.end_at ?? undefined;
        let end: string | undefined = undefined;

        if (t.start_at && t.end_at) {
          const sd = new Date(t.start_at);
          const ed = new Date(t.end_at);
          const sameDay =
            sd.getFullYear() === ed.getFullYear() &&
            sd.getMonth() === ed.getMonth() &&
            sd.getDate() === ed.getDate();

          if (!sameDay) {
            start = t.start_at;
            end = t.end_at;
          }
        }

        return {
          id: t.id,
          title: t.title,
          start,
          end,
          allDay: false,
          backgroundColor: statusColor[t.status],
          borderColor: statusColor[t.status],
          extendedProps: { status: t.status },
        };
      }).filter(Boolean)
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
    const interval = setInterval(() => {
      load();
    }, 20000);
    return () => clearInterval(interval);
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
  }, [view, hiddenListIds, isLargeZoom]);

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
        dayMaxEvents={isLargeZoom ? 5 : 3}
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