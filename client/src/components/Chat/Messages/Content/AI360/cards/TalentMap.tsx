import maplibregl from 'maplibre-gl';
import Supercluster from 'supercluster';
import { useEffect, useMemo, useState, useCallback } from 'react';
import type { Talent } from '../types';
import { Map, useMap, MapMarker, MarkerContent, MarkerTooltip, MarkerPopup } from '../map/Map';
import { Avatar } from '../Bits';
import { useLocalize } from '~/hooks';

type Located = Talent & { latitude: number; longitude: number };

function hasCoords(t: Talent): t is Located {
  return typeof t.latitude === 'number' && typeof t.longitude === 'number';
}

function TalentHoverCard({
  talent,
  localize,
  withProfileLink,
}: {
  talent: Located;
  localize: (k: string) => string;
  withProfileLink?: boolean;
}) {
  const meta = [talent.title, talent.current_company].filter(Boolean).join(' · ');
  const profileUrl = talent.profile_url || talent.linkedin_url || undefined;
  return (
    <div className="flex flex-col p-3 w-60 bg-neutral-900 rounded-xl shadow-xl">
      <div className="flex items-start gap-2">
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
      {withProfileLink && profileUrl ? (
        <a
          href={profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2.5 text-xs text-gray-300 underline underline-offset-2 hover:text-white"
        >
          {localize('com_ui_360_view_profile')}
        </a>
      ) : null}
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

type TalentPoint = GeoJSON.Feature<GeoJSON.Point, { talent: Located }>;

type ClusterFeature = GeoJSON.Feature<
  GeoJSON.Point,
  Supercluster.ClusterProperties & { cluster: true; cluster_id: number; point_count: number }
>;

type PointFeature = GeoJSON.Feature<GeoJSON.Point, { cluster: false; talent: Located }>;

type ClusterItem = ClusterFeature | PointFeature;

function buildSupercluster(located: Located[]): Supercluster<{ talent: Located }> {
  const sc = new Supercluster<{ talent: Located }>({ radius: 60, maxZoom: 16 });
  const points: TalentPoint[] = located.map((t) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [t.longitude, t.latitude] },
    properties: { talent: t },
  }));
  sc.load(points);
  return sc;
}

function getMapState(map: maplibregl.Map): { bbox: GeoJSON.BBox; zoom: number } {
  const b = map.getBounds();
  return {
    bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
    zoom: Math.floor(map.getZoom()),
  };
}

function ClusterLayer({
  located,
  localize,
}: {
  located: Located[];
  localize: (k: string) => string;
}) {
  const { map, isLoaded } = useMap();
  const [clusters, setClusters] = useState<ClusterItem[]>([]);

  const sc = useMemo(() => buildSupercluster(located), [located]);

  const recompute = useCallback(() => {
    if (!map) return;
    const { bbox, zoom } = getMapState(map);
    setClusters(sc.getClusters(bbox, zoom) as ClusterItem[]);
  }, [map, sc]);

  useEffect(() => {
    if (!map || !isLoaded) return;
    recompute();
    map.on('moveend', recompute);
    return () => {
      map.off('moveend', recompute);
    };
  }, [map, isLoaded, recompute]);

  return (
    <>
      {clusters.map((feature) => {
        const [lng, lat] = feature.geometry.coordinates;
        const props = feature.properties;

        if (props.cluster) {
          const cf = feature as ClusterFeature;
          const clusterId = cf.properties.cluster_id;
          const count = cf.properties.point_count;
          const leaves = sc.getLeaves(clusterId, 1);
          const rep: Located | undefined = leaves[0]?.properties?.talent;

          const handleClick = () => {
            if (!map) return;
            const expansionZoom = sc.getClusterExpansionZoom(clusterId);
            map.easeTo({ center: [lng, lat], zoom: expansionZoom });
          };

          return (
            <MapMarker key={`cluster-${clusterId}`} longitude={lng} latitude={lat}>
              <MarkerContent>
                <button
                  type="button"
                  onClick={handleClick}
                  className="relative flex items-center justify-center cursor-pointer"
                  aria-label={`Cluster of ${count} talents`}
                >
                  <div className="size-10 rounded-full ring-2 ring-white shadow-lg overflow-hidden [&>img]:size-10 [&>div]:size-10">
                    {rep ? <Avatar src={rep.avatar} name={rep.name} /> : null}
                  </div>
                  <span className="absolute -bottom-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-blue-600 text-white text-[10px] font-bold px-1 shadow">
                    +{count}
                  </span>
                </button>
              </MarkerContent>
            </MapMarker>
          );
        }

        const pf = feature as PointFeature;
        const t = pf.properties.talent;
        return (
          <MapMarker key={`talent-${String(t.id ?? `${lng},${lat}`)}`} longitude={lng} latitude={lat}>
            <MarkerContent>
              <div className="group size-8 rounded-full ring-2 ring-white shadow-md transition-transform hover:scale-110 [&>img]:size-8 [&>div]:size-8">
                <Avatar src={t.avatar} name={t.name} />
              </div>
            </MarkerContent>
            <MarkerTooltip offset={20} anchor="top">
              <TalentHoverCard talent={t} localize={localize} />
            </MarkerTooltip>
            <MarkerPopup className="w-auto p-0 bg-transparent border-0 shadow-none" closeButton offset={14}>
              <TalentHoverCard talent={t} localize={localize} withProfileLink />
            </MarkerPopup>
          </MapMarker>
        );
      })}
    </>
  );
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
        <ClusterLayer located={located} localize={localize} />
      </Map>
    </div>
  );
}
