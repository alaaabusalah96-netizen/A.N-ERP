import { 
  TripStop, 
  GeofenceArrivalCheckResult, 
  InspectionChecklistItem 
} from '../../types/fleet';

/**
 * Haversine formula to compute great-circle distance between two GPS coordinates in Kilometers
 */
export function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in KM
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
    Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c;
  return Math.round(d * 100) / 100;
}

/**
 * Normalizes a task title or type for consistent multi-tenant indexing
 */
export function normalizeTaskType(task: string): string {
  if (!task) return '';
  return task
    .trim()
    .toLowerCase()
    .replace(/[^\u0600-\u06FFa-zA-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Checks if a current GPS coordinate is inside the geofence perimeter of a target stop or location.
 * Default radius: 150 meters (can be customized).
 */
export function checkGeofenceArrival(
  currentCoord: { lat: number; lng: number },
  targetCoord: { lat: number; lng: number },
  geofenceRadiusMeters: number = 150,
  targetStop?: TripStop
): GeofenceArrivalCheckResult {
  const distKm = calculateDistanceKm(
    currentCoord.lat,
    currentCoord.lng,
    targetCoord.lat,
    targetCoord.lng
  );
  const distMeters = Math.round(distKm * 1000);
  const isInside = distMeters <= geofenceRadiusMeters;

  const stopName = targetStop?.taskTitle || targetStop?.location?.label || 'الموقع المستهدف';

  return {
    isInsideGeofence: isInside,
    distanceMeters: distMeters,
    matchedStop: targetStop,
    matchedStopId: targetStop?.id,
    geofenceRadiusMeters,
    messageAr: isInside 
      ? `المركبة داخل النطاق الجغرافي لـ (${stopName}) على بعد ${distMeters} متر` 
      : `المركبة على بعد ${distMeters} متر من (${stopName})`,
    messageEn: isInside 
      ? `Vehicle is within the geofence perimeter of (${stopName}) at ${distMeters}m` 
      : `Vehicle is ${distMeters}m away from (${stopName})`
  };
}

/**
 * Returns the standard pre-trip / post-trip inspection checklist template.
 */
export function getDefaultInspectionChecklist(): InspectionChecklistItem[] {
  return [
    {
      key: 'BRAKES',
      labelAr: 'الفرامل وفرامل اليد (الاستجابة والضغط)',
      labelEn: 'Brakes & Handbrake Response',
      isCritical: true,
      status: 'PASS'
    },
    {
      key: 'TIRES',
      labelAr: 'الإطارات وضغط الهواء والإطار الاحتياطي',
      labelEn: 'Tires, Pressure & Spare Tire',
      isCritical: true,
      status: 'PASS'
    },
    {
      key: 'FLUIDS',
      labelAr: 'مستويات الزيت، مياه الردياتير، وزيت الفرامل',
      labelEn: 'Engine Oil, Coolant & Brake Fluid Levels',
      isCritical: true,
      status: 'PASS'
    },
    {
      key: 'LIGHTS',
      labelAr: 'الإضاءة الأمامية والخلفية وإشارات التنبيه',
      labelEn: 'Headlights, Taillights & Turn Signals',
      isCritical: false,
      status: 'PASS'
    },
    {
      key: 'SAFETY_EQUIPMENT',
      labelAr: 'مطفأة الحريق، مثلث الطوارئ، وحقيبة الإسعافات',
      labelEn: 'Fire Extinguisher, Warning Triangle & First Aid Kit',
      isCritical: false,
      status: 'PASS'
    },
    {
      key: 'BODY_DAMAGE',
      labelAr: 'هيكل السيارة الخارجي والمرايا والزجاج',
      labelEn: 'Body Exterior, Mirrors & Windshield',
      isCritical: false,
      status: 'PASS'
    },
    {
      key: 'CLEANLINESS',
      labelAr: 'نظافة الكابينة وصندوق الشحن',
      labelEn: 'Cabin & Cargo Area Cleanliness',
      isCritical: false,
      status: 'PASS'
    },
    {
      key: 'DOCUMENTS',
      labelAr: 'رخصة السيارة، بطاقة التشغيل، ورخصة القيادة',
      labelEn: 'Vehicle License, Operation Card & Driver Permit',
      isCritical: false,
      status: 'PASS'
    }
  ];
}
