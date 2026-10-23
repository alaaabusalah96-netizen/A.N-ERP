import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Check, X } from 'lucide-react';

interface LeafletMapPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (coords: { lat: number; lng: number }) => void;
  initialLat?: number;
  initialLng?: number;
  stopLabel?: string;
  isRtl?: boolean;
}

export default function LeafletMapPickerModal({
  isOpen,
  onClose,
  onConfirm,
  initialLat,
  initialLng,
  stopLabel,
  isRtl = true,
}: LeafletMapPickerModalProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const [selectedCoords, setSelectedCoords] = useState<{ lat: number; lng: number } | null>(
    typeof initialLat === 'number' && typeof initialLng === 'number'
      ? { lat: initialLat, lng: initialLng }
      : null
  );

  useEffect(() => {
    if (!isOpen) return;

    if (typeof initialLat === 'number' && typeof initialLng === 'number') {
      setSelectedCoords({ lat: initialLat, lng: initialLng });
    } else {
      setSelectedCoords(null);
    }

    const timer = setTimeout(() => {
      if (!mapContainerRef.current) return;

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      const defaultLat = typeof initialLat === 'number' ? initialLat : 24.7136;
      const defaultLng = typeof initialLng === 'number' ? initialLng : 46.6753;
      const defaultZoom = typeof initialLat === 'number' ? 14 : 6;

      const map = L.map(mapContainerRef.current).setView([defaultLat, defaultLng], defaultZoom);
      mapInstanceRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      const pinIcon = L.divIcon({
        className: 'leaflet-custom-marker',
        html: `
          <div style="
            background-color: #4f46e5;
            width: 30px;
            height: 30px;
            border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg);
            display: flex;
            align-items: center;
            justify-content: center;
            border: 2px solid white;
            box-shadow: 0 4px 10px rgba(0,0,0,0.3);
          ">
            <div style="width: 10px; height: 10px; background: white; border-radius: 50%;"></div>
          </div>
        `,
        iconSize: [30, 30],
        iconAnchor: [15, 30],
      });

      if (typeof initialLat === 'number' && typeof initialLng === 'number') {
        markerRef.current = L.marker([initialLat, initialLng], { icon: pinIcon }).addTo(map);
      }

      map.on('click', (e: L.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;
        setSelectedCoords({ lat, lng });

        if (markerRef.current) {
          markerRef.current.setLatLng([lat, lng]);
        } else {
          markerRef.current = L.marker([lat, lng], { icon: pinIcon }).addTo(map);
        }
      });

      map.invalidateSize();
    }, 100);

    return () => {
      clearTimeout(timer);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
      }
    };
  }, [isOpen, initialLat, initialLng]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <MapPin className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 dark:text-white text-sm">
                {isRtl ? 'تحديد الموقع على الخريطة' : 'Select Location on Map'}
              </h3>
              {stopLabel && (
                <p className="text-xs text-slate-500 font-medium">
                  {stopLabel}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Map Viewport */}
        <div className="relative flex-1 min-h-[350px] w-full bg-slate-100 dark:bg-slate-950">
          <div ref={mapContainerRef} className="absolute inset-0 z-0 h-full w-full" />
          
          {/* Instructions overlay */}
          <div className="absolute top-3 left-3 right-3 z-[400] pointer-events-none flex justify-center">
            <span className="px-3 py-1.5 rounded-full bg-slate-900/80 backdrop-blur-md text-white text-[11px] font-medium shadow-lg">
              {isRtl ? 'انقر في أي مكان على الخريطة لتحديد الإحداثيات' : 'Click anywhere on the map to place a pin'}
            </span>
          </div>
        </div>

        {/* Footer & Actions */}
        <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="text-xs">
            {selectedCoords ? (
              <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-mono">
                <span className="font-bold text-indigo-600 dark:text-indigo-400">
                  {isRtl ? 'الإحداثيات:' : 'Coordinates:'}
                </span>
                <span>{selectedCoords.lat.toFixed(5)}, {selectedCoords.lng.toFixed(5)}</span>
              </div>
            ) : (
              <span className="text-slate-400 text-xs italic">
                {isRtl ? 'لم يتم تحديد موقع بعد' : 'No coordinates selected yet'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-200 dark:border-slate-800"
            >
              {isRtl ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="button"
              disabled={!selectedCoords}
              onClick={() => {
                if (selectedCoords) {
                  onConfirm(selectedCoords);
                  onClose();
                }
              }}
              className="px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <Check className="h-4 w-4" />
              <span>{isRtl ? 'تأكيد الموقع' : 'Confirm Location'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
