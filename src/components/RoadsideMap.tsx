import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Crosshair,
  ExternalLink,
  Maximize2,
  Navigation,
  Search,
  Star,
  Wrench,
} from 'lucide-react';
import { getCountryMethodDetail, getCountryPaymentProfile } from '../data/countryPayments';
import { BreakdownRequest, MechanicProfile, formatCustomerPaymentMethod } from '../types';

export interface LiveGeoPosition {
  lat: number;
  lng: number;
  accuracy?: number;
}

export interface MapRouteTarget {
  lat: number;
  lng: number;
  label: string;
}

interface RoadsideMapProps {
  centerLat: number;
  centerLng: number;
  mechanics: MechanicProfile[];
  requests?: BreakdownRequest[];
  activeLabel?: string;
  userLocation?: LiveGeoPosition | null;
  routeTo?: MapRouteTarget | null;
  gpsTracking?: boolean;
  gpsError?: string | null;
  onRequestCenterOnUser?: () => void;
  onPinSelect?: (lat: number, lng: number, resolvedLabel?: string) => void;
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistance(km: number): string {
  if (km < 1) {
    return `${Math.max(50, Math.round(km * 1000))} m away`;
  }
  return `${km.toFixed(1)} km away`;
}

export function estimateDriveMinutes(km: number): number {
  return Math.max(3, Math.round((km / 35) * 60));
}

export function buildGoogleMapsLink(lat: number, lng: number, origin?: LiveGeoPosition | null): string {
  if (origin) {
    return `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${lat},${lng}&travelmode=driving`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

export async function reverseGeocodeLabel(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
        lat
      )}&lon=${encodeURIComponent(lng)}`,
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      address?: {
        road?: string;
        suburb?: string;
        neighbourhood?: string;
        city?: string;
        town?: string;
        village?: string;
        country?: string;
      };
      display_name?: string;
    };
    const addr = data.address;
    if (addr) {
      const primary = addr.road || addr.suburb || addr.neighbourhood;
      const city = addr.city || addr.town || addr.village;
      const parts = [primary, city, addr.country].filter(Boolean);
      if (parts.length > 0) {
        return parts.slice(0, 2).join(', ').slice(0, 120);
      }
    }
    if (data.display_name) {
      return data.display_name.split(',').slice(0, 2).join(', ').trim().slice(0, 120);
    }
    return null;
  } catch {
    return null;
  }
}

function buildMechanicPopupNode(m: MechanicProfile, distKm: number): HTMLElement {
  const root = document.createElement('div');
  root.className = 'min-w-[190px] space-y-1 text-slate-900 font-sans';

  const title = document.createElement('div');
  title.className = 'text-xs font-bold text-slate-900';
  const crewCount = typeof m.teamMemberCount === 'number' && m.teamMemberCount >= 3 ? m.teamMemberCount : 3;
  title.textContent = `${m.displayName} (${crewCount}-tech crew)`;
  root.appendChild(title);

  const spec = document.createElement('div');
  spec.className = 'text-[11px] text-slate-600';
  spec.textContent = m.specialty;
  root.appendChild(spec);

  const meta = document.createElement('div');
  meta.className = 'text-[11px] font-medium text-slate-700 pt-0.5 tabular-nums';
  const countPart = typeof m.ratingCount === 'number' && m.ratingCount > 0 ? ` (${m.ratingCount})` : '';
  meta.textContent = `★ ${m.rating.toFixed(1)}${countPart} · ${formatDistance(distKm)} · ~${estimateDriveMinutes(distKm)} min`;
  root.appendChild(meta);

  const payout = document.createElement('div');
  payout.className = 'text-[11px] font-semibold text-emerald-700';
  const rails =
    m.acceptedPaymentMethods && m.acceptedPaymentMethods.length > 0
      ? m.acceptedPaymentMethods.slice(0, 3).map((pm) => formatCustomerPaymentMethod(pm)).join(', ')
      : m.qrPaymentLabel;
  payout.textContent = `Accepts: ${rails}`;
  root.appendChild(payout);

  return root;
}

function buildRequestPopupNode(req: BreakdownRequest, refLat: number, refLng: number): HTMLElement {
  const root = document.createElement('div');
  root.className = 'min-w-[200px] space-y-1 text-slate-900 font-sans';

  const title = document.createElement('div');
  title.className = 'text-xs font-bold text-slate-900';
  title.textContent = `${req.vehicleMakeModel} — $${req.offerPriceUsd}`;
  root.appendChild(title);

  const distKm = haversineKm(refLat, refLng, req.lat, req.lng);
  const loc = document.createElement('div');
  loc.className = 'text-[11px] text-slate-600';
  const country = getCountryPaymentProfile(req.countryCode);
  const payLabel = req.paymentMethod
    ? getCountryMethodDetail(country.code, req.paymentMethod).localLabel
    : formatCustomerPaymentMethod(req.paymentMethod);
  loc.textContent = `${req.locationLabel} (${formatDistance(distKm)}) · ${country.code} Pay: ${payLabel}`;
  root.appendChild(loc);

  const notes = document.createElement('div');
  notes.className = 'text-[11px] text-slate-700';
  notes.textContent = req.paymentDetailNote ? `${req.issueNotes} (${req.paymentDetailNote})` : req.issueNotes;
  root.appendChild(notes);

  return root;
}

function buildBreakdownPinIcon(): L.DivIcon {
  return L.divIcon({
    className: 'wrenchbid-breakdown-pin',
    html: `<div style="width:32px;height:32px;border-radius:9999px;background:#EA580C;border:2.5px solid #FFFFFF;box-shadow:0 4px 10px rgba(15,23,42,0.35);display:flex;align-items:center;justify-content:center;color:#FFFFFF;font-weight:700;font-size:13px;">!</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
}

function buildUserGpsIcon(): L.DivIcon {
  return L.divIcon({
    className: 'wrenchbid-user-gps-pin',
    html: `<div style="width:16px;height:16px;border-radius:9999px;background:#0284C7;border:3px solid #FFFFFF;box-shadow:0 0 0 4px rgba(2,132,199,0.28);"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -10],
  });
}

function buildMechanicPinIcon(name: string): L.DivIcon {
  const safeInitial = (name.trim()[0] || 'M').replace(/[<>&"']/g, '').toUpperCase();
  return L.divIcon({
    className: 'wrenchbid-mechanic-pin',
    html: `<div style="width:30px;height:30px;border-radius:9999px;background:#059669;border:2px solid #FFFFFF;box-shadow:0 3px 8px rgba(15,23,42,0.3);display:flex;align-items:center;justify-content:center;color:#FFFFFF;font-weight:700;font-size:12px;">${safeInitial}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15],
  });
}

function buildRequestPinIcon(priceUsd: number): L.DivIcon {
  const safePrice = Math.round(Number(priceUsd) || 0);
  return L.divIcon({
    className: 'wrenchbid-request-pin',
    html: `<div style="padding:2px 7px;border-radius:8px;background:#84CC16;border:1.5px solid #0F172A;box-shadow:0 3px 8px rgba(15,23,42,0.28);color:#0F172A;font-weight:800;font-size:11px;white-space:nowrap;">$${safePrice}</div>`,
    iconSize: [46, 24],
    iconAnchor: [23, 12],
    popupAnchor: [0, -12],
  });
}

export function RoadsideMap({
  centerLat,
  centerLng,
  mechanics,
  requests = [],
  activeLabel,
  userLocation,
  routeTo = null,
  gpsTracking = false,
  gpsError = null,
  onRequestCenterOnUser,
  onPinSelect,
}: RoadsideMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const breakdownLayerRef = useRef<L.LayerGroup | null>(null);
  const userGpsLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const mechanicsLayerRef = useRef<L.LayerGroup | null>(null);
  const requestsLayerRef = useRef<L.LayerGroup | null>(null);
  const mechanicMarkersByIdRef = useRef<Record<string, L.Marker>>({});
  const onPinSelectRef = useRef(onPinSelect);
  onPinSelectRef.current = onPinSelect;

  const [placeQuery, setPlaceQuery] = useState('');
  const [searchingPlace, setSearchingPlace] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const sortedMechanics = useMemo(() => {
    const refLat = userLocation?.lat ?? centerLat;
    const refLng = userLocation?.lng ?? centerLng;
    return [...mechanics]
      .map((m) => ({
        mechanic: m,
        distanceKm: haversineKm(refLat, refLng, m.lat, m.lng),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }, [mechanics, userLocation?.lat, userLocation?.lng, centerLat, centerLng]);

  const activeRouteDistanceKm = useMemo(() => {
    if (!routeTo) return null;
    const originLat = userLocation?.lat ?? centerLat;
    const originLng = userLocation?.lng ?? centerLng;
    return haversineKm(originLat, originLng, routeTo.lat, routeTo.lng);
  }, [routeTo, userLocation?.lat, userLocation?.lng, centerLat, centerLng]);

  const googleMapsHref = useMemo(() => {
    if (routeTo) {
      return buildGoogleMapsLink(routeTo.lat, routeTo.lng, userLocation ?? { lat: centerLat, lng: centerLng });
    }
    return buildGoogleMapsLink(centerLat, centerLng);
  }, [routeTo, userLocation, centerLat, centerLng]);

  // Initialize Leaflet Map once
  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;

    const map = L.map(el, {
      center: [centerLat, centerLng],
      zoom: 13,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    routeLayerRef.current = L.layerGroup().addTo(map);
    userGpsLayerRef.current = L.layerGroup().addTo(map);
    mechanicsLayerRef.current = L.layerGroup().addTo(map);
    requestsLayerRef.current = L.layerGroup().addTo(map);
    breakdownLayerRef.current = L.layerGroup().addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      if (!onPinSelectRef.current) return;
      const newLat = Number(e.latlng.lat.toFixed(5));
      const newLng = Number(e.latlng.lng.toFixed(5));
      onPinSelectRef.current(newLat, newLng);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      routeLayerRef.current = null;
      breakdownLayerRef.current = null;
      userGpsLayerRef.current = null;
      mechanicsLayerRef.current = null;
      requestsLayerRef.current = null;
      mechanicMarkersByIdRef.current = {};
    };
  }, []);

  // Pan map smoothly when centerLat / centerLng updates
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const current = map.getCenter();
    const moved = Math.abs(current.lat - centerLat) > 0.0001 || Math.abs(current.lng - centerLng) > 0.0001;
    if (moved) {
      map.panTo([centerLat, centerLng], { animate: true });
    }
  }, [centerLat, centerLng]);

  // Draw live dispatch route polyline when a job/target route is active
  useEffect(() => {
    const layer = routeLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (!routeTo) return;

    const originLat = userLocation?.lat ?? centerLat;
    const originLng = userLocation?.lng ?? centerLng;

    L.polyline(
      [
        [originLat, originLng],
        [routeTo.lat, routeTo.lng],
      ],
      {
        color: '#16A34A',
        weight: 3.5,
        dashArray: '8 6',
        opacity: 0.9,
      }
    ).addTo(layer);
  }, [routeTo, userLocation?.lat, userLocation?.lng, centerLat, centerLng]);

  // Update breakdown / dispatch pin
  useEffect(() => {
    const layer = breakdownLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    const marker = L.marker([centerLat, centerLng], {
      icon: buildBreakdownPinIcon(),
      draggable: Boolean(onPinSelect),
      title: activeLabel || 'Selected Location',
    });

    const popupNode = document.createElement('div');
    popupNode.className = 'text-xs font-sans text-slate-900 space-y-0.5';
    const heading = document.createElement('div');
    heading.className = 'font-bold';
    heading.textContent = onPinSelect ? 'Pickup / Breakdown Pin' : 'Your Crew Location';
    const sub = document.createElement('div');
    sub.className = 'text-[11px] text-slate-600 tabular-nums';
    sub.textContent = activeLabel || `${centerLat.toFixed(4)}, ${centerLng.toFixed(4)}`;
    popupNode.appendChild(heading);
    popupNode.appendChild(sub);
    marker.bindPopup(popupNode);

    if (onPinSelect) {
      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        onPinSelectRef.current?.(Number(pos.lat.toFixed(5)), Number(pos.lng.toFixed(5)));
      });
    }

    marker.addTo(layer);
  }, [centerLat, centerLng, activeLabel, onPinSelect]);

  // Update live user GPS marker & accuracy circle
  useEffect(() => {
    const layer = userGpsLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    if (!userLocation) return;

    if (typeof userLocation.accuracy === 'number' && userLocation.accuracy > 0) {
      L.circle([userLocation.lat, userLocation.lng], {
        radius: Math.min(userLocation.accuracy, 1200),
        color: '#0284C7',
        fillColor: '#38BDF8',
        fillOpacity: 0.14,
        weight: 1,
      }).addTo(layer);
    }

    const gpsMarker = L.marker([userLocation.lat, userLocation.lng], {
      icon: buildUserGpsIcon(),
      interactive: true,
      title: 'Your Live GPS Location',
    });
    const popupNode = document.createElement('div');
    popupNode.className = 'text-xs font-sans text-slate-900';
    popupNode.textContent = `Your Current Location (${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)})`;
    gpsMarker.bindPopup(popupNode);
    gpsMarker.addTo(layer);
  }, [userLocation]);

  // Update real-time online mechanic markers
  useEffect(() => {
    const layer = mechanicsLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    mechanicMarkersByIdRef.current = {};

    const refLat = userLocation?.lat ?? centerLat;
    const refLng = userLocation?.lng ?? centerLng;

    mechanics.forEach((m) => {
      const distKm = haversineKm(refLat, refLng, m.lat, m.lng);
      const marker = L.marker([m.lat, m.lng], {
        icon: buildMechanicPinIcon(m.displayName),
        title: `${m.displayName} · ${m.specialty}`,
      });
      marker.bindPopup(buildMechanicPopupNode(m, distKm));
      marker.addTo(layer);
      mechanicMarkersByIdRef.current[m.uid] = marker;
    });
  }, [mechanics, userLocation?.lat, userLocation?.lng, centerLat, centerLng]);

  // Update open breakdown request markers (for Mechanic view)
  useEffect(() => {
    const layer = requestsLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    const refLat = userLocation?.lat ?? centerLat;
    const refLng = userLocation?.lng ?? centerLng;

    requests.forEach((req) => {
      const marker = L.marker([req.lat, req.lng], {
        icon: buildRequestPinIcon(req.offerPriceUsd),
        title: `${req.vehicleMakeModel} ($${req.offerPriceUsd})`,
      });
      marker.bindPopup(buildRequestPopupNode(req, refLat, refLng));
      marker.addTo(layer);
    });
  }, [requests, userLocation?.lat, userLocation?.lng, centerLat, centerLng]);

  const handleFitNearby = () => {
    const map = mapRef.current;
    if (!map) return;

    const points: L.LatLngExpression[] = [[centerLat, centerLng]];
    if (userLocation) {
      points.push([userLocation.lat, userLocation.lng]);
    }
    if (routeTo) {
      points.push([routeTo.lat, routeTo.lng]);
    }
    mechanics.forEach((m) => points.push([m.lat, m.lng]));
    requests.forEach((r) => points.push([r.lat, r.lng]));

    if (points.length <= 1) {
      map.setView([centerLat, centerLng], 13, { animate: true });
      return;
    }

    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [36, 36], maxZoom: 14, animate: true });
  };

  const handleFocusMechanic = (m: MechanicProfile) => {
    const map = mapRef.current;
    if (!map) return;
    map.setView([m.lat, m.lng], 14, { animate: true });
    mechanicMarkersByIdRef.current[m.uid]?.openPopup();
  };

  const handleSearchPlace = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = placeQuery.trim();
    if (!q || !onPinSelect) return;
    setSearchingPlace(true);
    setSearchError(null);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
        { headers: { Accept: 'application/json' } }
      );
      if (!res.ok) throw new Error('Location lookup failed');
      const items = (await res.json()) as Array<{
        lat: string;
        lon: string;
        display_name: string;
      }>;
      if (!items.length) {
        setSearchError('No matching area found — try a nearby city or street, or tap the map.');
        return;
      }
      const match = items[0];
      const nextLat = Number(Number(match.lat).toFixed(5));
      const nextLng = Number(Number(match.lon).toFixed(5));
      const shortLabel = match.display_name.split(',').slice(0, 2).join(', ').trim().slice(0, 120);
      onPinSelect(nextLat, nextLng, shortLabel || q);
      mapRef.current?.setView([nextLat, nextLng], 14, { animate: true });
    } catch {
      setSearchError('Unable to look up address right now — tap the map pin instead.');
    } finally {
      setSearchingPlace(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      {/* Map Header */}
      <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 min-w-0">
          <Navigation className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="whitespace-nowrap">Live Dispatch Map</span>
          {gpsTracking && (
            <span className="text-[11px] font-medium text-sky-700 whitespace-nowrap">
              · GPS Live
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {onRequestCenterOnUser && (
            <button
              type="button"
              onClick={onRequestCenterOnUser}
              className="min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[11px] font-semibold text-slate-700 inline-flex items-center gap-1 whitespace-nowrap transition-colors"
            >
              <Crosshair className="w-3.5 h-3.5 text-sky-600" />
              My Location
            </button>
          )}
          <button
            type="button"
            onClick={handleFitNearby}
            className="min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[11px] font-semibold text-slate-700 inline-flex items-center gap-1 whitespace-nowrap transition-colors"
          >
            <Maximize2 className="w-3.5 h-3.5 text-slate-600" />
            Fit Nearby
          </button>
          <a
            href={googleMapsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-800 inline-flex items-center gap-1 whitespace-nowrap transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5 text-emerald-600" />
            Google Maps
          </a>
        </div>
      </div>

      {/* Location Search Bar (lets users jump map to their city/street) */}
      {onPinSelect && (
        <form
          onSubmit={(e) => void handleSearchPlace(e)}
          className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2"
        >
          <div className="relative flex-1 min-w-0">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={placeQuery}
              onChange={(e) => setPlaceQuery(e.target.value)}
              placeholder="Search street, suburb, or city (e.g. Harare, Nairobi, Austin)..."
              className="w-full min-h-[36px] pl-8 pr-3 py-1 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 placeholder:text-slate-400"
            />
          </div>
          <button
            type="submit"
            disabled={searchingPlace || !placeQuery.trim()}
            className="min-h-[36px] px-3 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold whitespace-nowrap shrink-0"
          >
            {searchingPlace ? 'Finding...' : 'Set Area'}
          </button>
        </form>
      )}

      {searchError && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-[11px] text-amber-900">
          {searchError}
        </div>
      )}

      {/* Active Route Distance & ETA Banner (inDrive-style live dispatch strip) */}
      {routeTo && activeRouteDistanceKm !== null && (
        <div className="px-4 py-2.5 bg-emerald-50 border-b border-emerald-200 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="font-semibold text-emerald-950">
            Active route: {routeTo.label}
          </div>
          <div className="font-semibold text-emerald-800 tabular-nums">
            {formatDistance(activeRouteDistanceKm)} · ~{estimateDriveMinutes(activeRouteDistanceKm)} min drive
          </div>
        </div>
      )}

      {/* Real Leaflet Map Canvas (isolated z-index so sticky header/modals remain on top) */}
      <div className="relative isolate z-0 h-72 sm:h-80 w-full bg-slate-100">
        <div ref={containerRef} className="w-full h-full" />
      </div>

      {gpsError && (
        <div className="px-4 py-2 bg-amber-50 border-t border-amber-200 text-[11px] text-amber-900">
          {gpsError}
        </div>
      )}

      {/* Map Legend & Live Coordinates */}
      <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-600 inline-block" />
            {onPinSelect ? 'Pickup Pin' : 'Crew Pin'}
          </span>
          {userLocation && (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-600 inline-block" />
              Your GPS
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 tabular-nums">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" />
            {mechanics.length} Online {mechanics.length === 1 ? 'Crew' : 'Crews'}
          </span>
          {requests.length > 0 && (
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <span className="w-2.5 h-2.5 rounded-sm bg-lime-400 border border-slate-900 inline-block" />
              {requests.length} Live {requests.length === 1 ? 'Offer' : 'Offers'}
            </span>
          )}
        </div>
        <span className="text-[11px] text-slate-500 tabular-nums">
          {onPinSelect
            ? `Tap map or drag pin · ${centerLat.toFixed(4)}, ${centerLng.toFixed(4)}`
            : activeLabel || `${centerLat.toFixed(4)}, ${centerLng.toFixed(4)}`}
        </span>
      </div>

      {/* Real-Time Nearby Mechanic Crews List */}
      {requests.length === 0 && (
        <div className="border-t border-slate-200 divide-y divide-slate-100">
          {sortedMechanics.length === 0 ? (
            <div className="px-4 py-3 text-xs text-slate-500">
              No online mechanic crews nearby yet—live pins appear automatically when crews go online.
            </div>
          ) : (
            sortedMechanics.slice(0, 4).map(({ mechanic: m, distanceKm }) => (
              <button
                key={m.uid}
                type="button"
                onClick={() => handleFocusMechanic(m)}
                className="w-full px-4 py-2.5 text-left hover:bg-slate-50 transition-colors flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-900 flex items-center gap-1.5 truncate">
                    <Wrench className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="truncate">{m.displayName}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">{m.specialty}</div>
                </div>
                <div className="text-right shrink-0 space-y-0.5 tabular-nums">
                  <div className="text-xs font-semibold text-slate-800 inline-flex items-center gap-1 justify-end">
                    <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                    {m.rating.toFixed(1)}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {formatDistance(distanceKm)} · ~{estimateDriveMinutes(distanceKm)}m
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
