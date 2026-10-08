import { useEffect, useState } from 'react';
import { getZoomPct } from '../lib/zoom';

/**
 * Retourne le zoom courant (en %) et se met à jour à chaque changement.
 * Utilisable dans n'importe quel composant sans prop drilling.
 */
export function useZoom(): number {
  const [zoom, setZoom] = useState<number>(() => getZoomPct());

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<number>).detail;
      if (typeof detail === 'number') setZoom(detail);
    };
    window.addEventListener('zoom-changed', handler);
    return () => window.removeEventListener('zoom-changed', handler);
  }, []);

  return zoom;
}