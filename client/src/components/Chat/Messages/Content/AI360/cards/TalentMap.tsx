import maplibregl from 'maplibre-gl';
import { useEffect, useMemo, useRef } from 'react';
import type { Talent } from '../types';
import { Map, MapMarker, MarkerContent, MarkerTooltip, MarkerPopup, type MapRef } from '../map/Map';
import { Avatar, Pill } from '../Bits';
import { useLocalize } from '~/hooks';

type Located = Talent & { latitude: number; longitude: number };

function hasCoords(t: Talent): t is Located {
  return typeof t.latitude === 'number' && typeof t.longitude === 'number';
}

function TalentHoverCard({ talent, localize }: { talent: Located; localize: (k: string) => string }) {
  const meta = [talent.title, talent.current_company].filter(Boolean).join(' · ');
  return (
    <div className="flex items-start gap-2.5 p-2.5 w-56">
      <div className="shrink-0">
        <img
          src={talent.avatar ?? undefined}
          alt={talent.name ?? ''}
          className="size-8 rounded-full object-cover ring-2 ring-white shadow"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-text-primary capitalize">{talent.name}</p>
        {meta ? <p className="truncate text-xs text-text-secondary mt-0.5">{meta}</p> : null}
        {talent.location ? (
          <p className="truncate text-xs text-text-secondary mt-0.5">{talent.location}</p>
        ) : null}
        {talent.open_to_work === true ? (
          <div className="mt-1.5">
            <Pill>{localize('com_ui_360_open_to_work')}</Pill>
          </div>
        ) : null}
      </div>
    </div>
  );
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
    if (!located.length || !mapRef.current) return;
    const map = mapRef.current;

    const fit = () => {
      const bounds = new maplibregl.LngLatBounds();
      for (const t of located) {
        bounds.extend([t.longitude, t.latitude]);
      }
      map.fitBounds(bounds, { padding: 64, maxZoom: 11, duration: 600 });
    };

    if (map.loaded()) {
      fit();
    } else {
      map.once('load', fit);
    }
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
              <div className="group size-8 rounded-full ring-2 ring-white shadow-md transition-transform hover:scale-110 [&>img]:size-8 [&>div]:size-8">
                <Avatar src={t.avatar} name={t.name} />
              </div>
            </MarkerContent>
            <MarkerTooltip offset={20} anchor="top">
              <TalentHoverCard talent={t} localize={localize} />
            </MarkerTooltip>
            <MarkerPopup className="w-64 p-0" closeButton offset={14}>
              <div className="space-y-2 p-3">
                <TalentHoverCard talent={t} localize={localize} />
                {(t.linkedin_url || t.profile_url) ? (
                  <div className="border-t border-ai360-chip-border pt-2 px-2.5 pb-0.5">
                    <a
                      href={t.profile_url || t.linkedin_url || undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-ai360-action underline"
                    >
                      {localize('com_ui_360_view_profile')}
                    </a>
                  </div>
                ) : null}
              </div>
            </MarkerPopup>
          </MapMarker>
        ))}
      </Map>
    </div>
  );
}
