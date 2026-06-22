import maplibregl from 'maplibre-gl';
import { useEffect, useMemo } from 'react';
import type { Talent } from '../types';
import { Map, useMap, MapMarker, MarkerContent, MarkerTooltip, MarkerPopup } from '../map/Map';
import { Avatar } from '../Bits';
import { useLocalize } from '~/hooks';

type Located = Talent & { latitude: number; longitude: number };

function hasCoords(t: Talent): t is Located {
  return typeof t.latitude === 'number' && typeof t.longitude === 'number';
}

function TalentHoverCard({ talent, localize }: { talent: Located; localize: (k: string) => string }) {
  const meta = [talent.title, talent.current_company].filter(Boolean).join(' · ');
  return (
    <div className="flex items-start gap-2 p-3 w-60 bg-neutral-900 rounded-xl shadow-xl">
      <div className="shrink-0">
        <Avatar src={talent.avatar} name={talent.name} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white capitalize">{talent.name}</p>
        {meta ? <p className="truncate text-xs text-gray-300 mt-0.5">{meta}</p> : null}
        {talent.location ? (
          <p className="truncate text-xs text-gray-400 mt-0.5">{talent.location}</p>
        ) : null}
        {talent.open_to_work === true ? (
          <div className="mt-1.5">
            <span className="inline-flex items-center rounded-full border border-emerald-500/40 px-2.5 py-0.5 text-xs text-emerald-400">
              {localize('com_ui_360_open_to_work')}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FitBounds({ located }: { located: Located[] }) {
  const { map, isLoaded } = useMap();

  useEffect(() => {
    if (!map || !isLoaded || !located.length) return;

    if (located.length === 1) {
      map.easeTo({ center: [located[0].longitude, located[0].latitude], zoom: 11, duration: 0 });
      return;
    }

    const bounds = new maplibregl.LngLatBounds();
    for (const t of located) {
      bounds.extend([t.longitude, t.latitude]);
    }
    map.fitBounds(bounds, { padding: 64, maxZoom: 11, duration: 0 });
  }, [map, isLoaded, located]);

  return null;
}

export default function TalentMap({ talents }: { talents: Talent[] }) {
  const localize = useLocalize();
  const located = useMemo(() => talents.filter(hasCoords), [talents]);

  const center = useMemo<[number, number]>(() => {
    if (!located.length) return [0, 20];
    const lng = located.reduce((s, t) => s + t.longitude, 0) / located.length;
    const lat = located.reduce((s, t) => s + t.latitude, 0) / located.length;
    return [lng, lat];
  }, [located]);

  if (!located.length) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-ai360-chip-border text-sm text-text-secondary">
        {localize('com_ui_360_map_no_locations')}
      </div>
    );
  }

  return (
    <div className="ai360-talent-map h-[420px] w-full overflow-hidden rounded-xl border border-ai360-chip-border">
      <Map center={center} zoom={3}>
        <FitBounds located={located} />
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
            <MarkerPopup className="w-auto p-0 bg-transparent border-0 shadow-none" closeButton offset={14}>
              <div className="space-y-0">
                <TalentHoverCard talent={t} localize={localize} />
                {(t.linkedin_url || t.profile_url) ? (
                  <div className="px-3 pb-3 -mt-1 bg-neutral-900 rounded-b-xl">
                    <div className="border-t border-white/10 pt-2">
                      <a
                        href={t.profile_url || t.linkedin_url || undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-gray-300 underline underline-offset-2 hover:text-white"
                      >
                        {localize('com_ui_360_view_profile')}
                      </a>
                    </div>
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
