import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import multiMonthPlugin from '@fullcalendar/multimonth';
import interactionPlugin from '@fullcalendar/interaction';
import frLocale from '@fullcalendar/core/locales/fr';
import { useEffect, useRef, useState } from 'react';
import { api, type Task, type TaskStatus } from '../lib/api';
import { formatTaskDate } from '../lib/formatDate';
import { useZoom } from '../hooks/useZoom';

interface Props {
  hiddenListIds: Set<string>;
}

type View = 'dayGridMonth' | 'multiMonthQuarter' | 'multiMonthYear';

const statusEventStyle: Record<
  TaskStatus,
  { bg: string; border: string; text: string }
> = {
  todo:        { bg: '#dbeafe', border: '#93c5fd', text: '#1e40af' },
  in_progress: { bg: '#fef3c7', border: '#fcd34d', text: '#b45309' },
  done:        { bg: '#d1fae5', border: '#86efac', text: '#047857' },
};

const statusLabel: Record<TaskStatus, string> = {
  todo: 'À faire',
  in_progress: 'En cours',
  done: 'Validé',
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

interface TooltipState {
  taskId: string;
  x: number;
  y: number;
}

export default function CalendarView({ hiddenListIds }: Props) {
  const zoom = useZoom();
  const isLargeZoom = zoom >= 130;

  const [view, setView] = useState<View>('dayGridMonth');
  const [events, setEvents] = useState<any[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const calendarRef = useRef<FullCalendar>(null);

  const tooltipTask = tooltip
    ? tasks.find((t) => t.id === tooltip.taskId) ?? null
    : null;

  const load = async () => {
    const now = new Date();
    const from = new Date(now.getFullYear() - 5, 0, 1).toISOString();
    const to   = new Date(now.getFullYear() + 10, 0, 1).toISOString();
    const rows = await api.listRange(from, to);

    const visible = rows.filter(
      (t) => !t.list_id || !hiddenListIds.has(t.list_id)
    );
    setTasks(visible);

    setEvents(
      visible.map((t) => {
        const colors = statusEventStyle[t.status];

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
            end: sameDay ? undefined : end.toISOString(),
            allDay: true,
            backgroundColor: colors.bg,
            borderColor: colors.border,
            textColor: colors.text,
            extendedProps: { status: t.status },
          };
        }

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
          backgroundColor: colors.bg,
          borderColor: colors.border,
          textColor: colors.text,
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

  const handleEventMouseEnter = (info: any) => {
    setTooltip({
      taskId: info.event.id,
      x: info.jsEvent.clientX,
      y: info.jsEvent.clientY,
    });
  };

  const handleEventMouseLeave = () => {
    setTooltip(null);
  };

  const handleEventClick = async (info: any) => {
    const taskId = info.event.id;
    const current = info.event.extendedProps.status as TaskStatus;
    const next = nextStatus[current];

    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: next } : t))
    );
    setEvents((prev) =>
      prev.map((e) => {
        if (e.id !== taskId) return e;
        const c = statusEventStyle[next];
        return {
          ...e,
          backgroundColor: c.bg,
          borderColor: c.border,
          textColor: c.text,
          extendedProps: { ...e.extendedProps, status: next },
        };
      })
    );

    try {
      await api.setStatus(taskId, next);
    } catch (err) {
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: current } : t))
      );
      setEvents((prev) =>
        prev.map((e) => {
          if (e.id !== taskId) return e;
          const c = statusEventStyle[current];
          return {
            ...e,
            backgroundColor: c.bg,
            borderColor: c.border,
            textColor: c.text,
            extendedProps: { ...e.extendedProps, status: current },
          };
        })
      );
      console.error('setStatus failed:', err);
    }
  };

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
        eventMouseEnter={handleEventMouseEnter}
        eventMouseLeave={handleEventMouseLeave}
        eventClick={handleEventClick}
        eventDrop={async (info) => {
          const d = info.event.start?.toISOString() ?? null;
          await api.update(info.event.id, { start_at: d, end_at: d });
        }}
        headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
        height="100%"
      />

      {tooltipTask && tooltip && (
        <CalendarTooltip task={tooltipTask} x={tooltip.x} y={tooltip.y} />
      )}
    </div>
  );
}

/* ============================================================
   Tooltip
   ============================================================ */
interface TooltipProps {
  task: Task;
  x: number;
  y: number;
}

function CalendarTooltip({ task, x, y }: TooltipProps) {
  const colors = statusEventStyle[task.status];
  const linkCount = Array.isArray(task.links) ? task.links.length : 0;
  const dateLabel = formatTaskDate(task);

  const TOOLTIP_W = 260;
  const OFFSET = 14;
  const MARGIN = 8;

  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;

  let left = x + OFFSET;
  if (left + TOOLTIP_W > viewportW - MARGIN) {
    left = x - TOOLTIP_W - OFFSET;
  }
  if (left < MARGIN) left = MARGIN;

  const estimatedHeight = 140;
  let top = y + OFFSET;
  if (top + estimatedHeight > viewportH - MARGIN) {
    top = y - estimatedHeight - OFFSET;
  }
  if (top < MARGIN) top = MARGIN;

  return (
    <div className="cal-tooltip" style={{ left, top, width: TOOLTIP_W }}>
      {/* ⭐ Titre à gauche + colonne statut + liste centrée à droite */}
      <div className="cal-tooltip-header">
        <span className="cal-tooltip-title">{task.title}</span>

        <div className="cal-tooltip-status-col">
          <span
            className="cal-tooltip-badge"
            style={{
              backgroundColor: colors.bg,
              color: colors.text,
              borderColor: colors.border,
            }}
          >
            {statusLabel[task.status]}
          </span>

          {task.list_name && (
            <span className="cal-tooltip-list-inline">
              <span
                className="cal-tooltip-list-dot"
                style={{ background: task.list_color ?? '#cbd5e1' }}
              />
              <span className="cal-tooltip-list-name">{task.list_name}</span>
            </span>
          )}
        </div>
      </div>

      {dateLabel && (
        <div className="cal-tooltip-row">
          <span className="cal-tooltip-icon">📅</span>
          <span>{dateLabel}</span>
        </div>
      )}

      {task.description && (
        <div className="cal-tooltip-desc">{task.description}</div>
      )}

      {linkCount > 0 && (
        <div className="cal-tooltip-row cal-tooltip-links">
          <span className="cal-tooltip-icon">📁</span>
          <span>
            {linkCount} document{linkCount > 1 ? 's' : ''}
          </span>
        </div>
      )}
    </div>
  );
}