import { useEffect, useMemo, useRef } from 'react';
import type { Talent } from '../types';
import { Map, MapMarker, MarkerContent, MarkerTooltip, MarkerPopup, type MapRef } from '../map/Map';
import { useLocalize } from '~/hooks';

type Located = Talent & { latitude: number; longitude: number };

function hasCoords(t: Talent): t is Located {
  return typeof t.latitude === 'number' && typeof t.longitude === 'number';
}

export default function TalentMap({ talents }: { talents: Talent[] }) {
  const localize = useLocalize();
  const located = useMemo(() => talents.filter(hasCoords), [talents]);
  const mapRef = useRef<MapRef>(null);

  const center = useMemo<[number, number]>(() => {
    if (!located.length) return [0, 20];
    const lng = located.reduce((s, t) => s + t.longitude, 0) / located.length;
    const lat = located.reduce((s, t) => s + t.latitude, 0) / located.length;
    return [lng, lat];
  }, [located]);

  useEffect(() => {
    if (located.length < 2 || !mapRef.current) return;
    const lngs = located.map((t) => t.longitude);
    const lats = located.map((t) => t.latitude);
    mapRef.current.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: 60, duration: 800 },
    );
  }, [located]);

  if (!located.length) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-ai360-chip-border text-sm text-text-secondary">
        {localize('com_ui_360_map_no_locations')}
      </div>
    );
  }

  return (
    <div className="h-[420px] w-full overflow-hidden rounded-xl border border-ai360-chip-border">
      <Map ref={mapRef} center={center} zoom={located.length === 1 ? 9 : 3}>
        {located.map((t, i) => (
          <MapMarker key={String(t.id ?? i)} longitude={t.longitude} latitude={t.latitude}>
            <MarkerContent>
              <div className="size-3 rounded-full border-2 border-white bg-ai360-action shadow-md" />
            </MarkerContent>
            <MarkerTooltip offset={16} anchor="top">{t.name}</MarkerTooltip>
            <MarkerPopup className="w-60 p-0" closeButton offset={14}>
              <div className="space-y-1 p-3">
                <div className="font-semibold text-text-primary">{t.name}</div>
                {t.title ? (
                  <div className="text-xs text-text-secondary">
                    {t.title}{t.current_company ? ` · ${t.current_company}` : ''}
                  </div>
                ) : null}
                {t.open_to_work ? (
                  <div className="text-xs text-green-600">{localize('com_ui_360_open_to_work')}</div>
                ) : null}
                {t.linkedin_url ? (
                  <a
                    href={t.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-ai360-action underline"
                  >
                    {localize('com_ui_360_view_profile')}
                  </a>
                ) : null}
              </div>
            </MarkerPopup>
          </MapMarker>
        ))}
      </Map>
    </div>
  );
}
