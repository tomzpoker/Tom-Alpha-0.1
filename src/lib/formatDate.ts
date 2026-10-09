import type { Task } from './api';

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

/** "10h00", "10h30" — toujours 2 chiffres pour les minutes */
function formatTime(d: Date): string {
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}h${m}`;
}

/**
 * Format date partagé entre la vue Liste et la tooltip du Calendrier.
 * ⚠️ Modifier ici = modifié partout.
 */
export function formatTaskDate(t: Task): string {
  const start = t.start_at ? new Date(t.start_at) : null;
  const end = t.end_at ? new Date(t.end_at) : null;
  const now = new Date();

  if (!start && !end) return '';

  // ============================================================
  // Cas multi-jours
  // ============================================================
  if (start && end) {
    const diffDays = daysBetween(start, end);
    if (diffDays > 0) {
      const startDay = start.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'short',
      });
      const endDay = end.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'short',
      });
      if (t.all_day) return `Du ${startDay} au ${endDay}`;
      return `Du ${startDay} au ${endDay} → ${formatTime(end)}`;
    }
  }

  // ============================================================
  // Cas même jour
  // ============================================================
  const ref = end ?? start;
  if (!ref) return '';

  const diff = daysBetween(now, ref);

  let dayLabel: string;
  if (diff === 0) dayLabel = "Aujourd'hui";
  else if (diff === 1) dayLabel = 'Demain';
  else if (diff === -1) dayLabel = 'Hier';
  else if (diff < 0) dayLabel = `Il y a ${Math.abs(diff)} j`;
  else if (diff < 7) dayLabel = `Dans ${diff} j`;
  else {
    dayLabel = ref.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: ref.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  }

  if (t.all_day) return dayLabel;
  if (start && end) return `${dayLabel}, ${formatTime(start)} → ${formatTime(end)}`;
  return `${dayLabel}, ${formatTime(ref)}`;
}