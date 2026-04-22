import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/**
 * Minimal Leaflet wrapper. Renders a single pin for the given coordinates.
 *
 * Why not react-leaflet's MapContainer?
 * - react-leaflet 5 hot-reloads cleanly, but it re-renders on every parent
 *   re-render which causes visible flicker when the side panel updates.
 * - Managing the map imperatively with `useEffect` is a few more lines but
 *   gives us a stable map instance with predictable coord updates.
 *
 * Tiles come from OpenStreetMap (free, no key). Respect the attribution —
 * it's required by their license.
 */
export default function JobMap({ lat, lng, label }: { lat: number; lng: number; label?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  // Leaflet bundles marker-icon images via CSS URLs that break under Vite's
  // module hashing. Re-wire them to the packaged asset URLs so the pin renders.
  // Done once per module load — safe to call repeatedly.
  useEffect(() => {
    type IconWithDefault = typeof L.Icon & { Default: { prototype: { _getIconUrl?: () => string } } };
    delete ((L.Icon as IconWithDefault).Default.prototype._getIconUrl);
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).toString(),
      iconUrl:       new URL('leaflet/dist/images/marker-icon.png', import.meta.url).toString(),
      shadowUrl:     new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).toString(),
    });
  }, []);

  // Create map instance once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true })
      .setView([lat, lng], 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    markerRef.current = L.marker([lat, lng]).addTo(map);
    if (label) markerRef.current.bindPopup(label);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update marker position / popup when coordinates change.
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    marker.setLatLng([lat, lng]);
    if (label) marker.bindPopup(label);
    map.setView([lat, lng], map.getZoom());
    // Leaflet sometimes miscalculates size when mounted in a panel that
    // animates in — nudge it on the next frame.
    requestAnimationFrame(() => map.invalidateSize());
  }, [lat, lng, label]);

  return <div ref={containerRef} className="w-full h-56 rounded-md overflow-hidden border-[3px] border-neo-border" />;
}
