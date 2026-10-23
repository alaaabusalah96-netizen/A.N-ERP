import React, { useState, useEffect } from 'react';
import { Siren, Sparkles, MapPin, Truck, User, Calendar, CheckCircle2, AlertCircle } from 'lucide-react';
import { Vehicle, LearnedLocationHistoryEntry } from '../types/fleet';
import { FleetBusinessEngine } from '../lib/enterprise/fleet_engine';

interface EmergencyTripModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
  activeUserId: string;
  orgUnits: Array<{ id: string; name: string }>;
  isRtl: boolean;
  onSuccess: () => void;
}

const EMERGENCY_PRESETS = [
  'نقل طارئ / عاجل',
  'تغيير اسطوانات غاز طارئ',
  'صيانة ميدانية عاجلة',
  'استلام مستندات ومحاضر طارئة',
  'توريد بضاعة عاجل'
];

export default function EmergencyTripModal({
  isOpen,
  onClose,
  companyId,
  activeUserId,
  orgUnits,
  isRtl,
  onSuccess
}: EmergencyTripModalProps) {
  if (!isOpen) return null;

  const allVehicles = FleetBusinessEngine.getVehiclesByOrgUnit(companyId);
  const activeVehicles = allVehicles.filter(v => !['BREAKDOWN', 'OUT_OF_SERVICE', 'INACTIVE', 'MAINTENANCE'].includes(v.status));

  const [taskType, setTaskType] = useState<string>(EMERGENCY_PRESETS[0]);
  const [selectedOrgUnitId, setSelectedOrgUnitId] = useState<string>(orgUnits[0]?.id || '');
  const [notes, setNotes] = useState<string>('');
  const [startLocationLabel, setStartLocationLabel] = useState<string>('مقر الفرع الرئيسي');
  const [destinationLabel, setDestinationLabel] = useState<string>('');
  const [destLat, setDestLat] = useState<number | undefined>(undefined);
  const [destLng, setDestLng] = useState<number | undefined>(undefined);

  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(activeVehicles[0]?.id || '');
  const [selectedDriverName, setSelectedDriverName] = useState<string>(activeVehicles[0]?.driverName || '');
  const [submitting, setSubmitting] = useState(false);
  const [busyVehicleWarning, setBusyVehicleWarning] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [suggestedLocations, setSuggestedLocations] = useState<LearnedLocationHistoryEntry[]>([]);

  // Update suggested locations strictly when org_unit and task_type change
  useEffect(() => {
    if (companyId && selectedOrgUnitId && taskType) {
      const suggestions = FleetBusinessEngine.getSuggestedLocationsForTask(
        companyId,
        selectedOrgUnitId,
        taskType
      );
      setSuggestedLocations(suggestions);
    } else {
      setSuggestedLocations([]);
    }
  }, [companyId, selectedOrgUnitId, taskType]);

  const handleSelectSuggestedLocation = (loc: LearnedLocationHistoryEntry) => {
    setDestinationLabel(loc.label);
    setDestLat(loc.lat);
    setDestLng(loc.lng);
  };

  const handleVehicleChange = (vehId: string) => {
    setSelectedVehicleId(vehId);
    const v = allVehicles.find(item => item.id === vehId);
    if (v?.driverName) {
      setSelectedDriverName(v.driverName);
    }
  };

  const handlePickNearestVehicle = () => {
    if (destLat && destLng) {
      const nearest = FleetBusinessEngine.suggestNearestVehiclesForTasks(companyId, { lat: destLat, lng: destLng });
      if (nearest.length > 0) {
        handleVehicleChange(nearest[0].vehicle.id);
      }
    } else {
      // Fallback: pick first active
      if (activeVehicles.length > 0) {
        handleVehicleChange(activeVehicles[0].id);
      }
    }
  };

  const handleCreate = async (confirmed: boolean = false) => {
    if (!taskType.trim() || !selectedVehicleId || !selectedOrgUnitId) return;

    if (!confirmed) {
      const openTrips = FleetBusinessEngine.getOpenTripsForVehicle(companyId, selectedVehicleId);
      if (openTrips.length > 0) {
        setBusyVehicleWarning(
          isRtl
            ? `تنبيه: المركبة المختارة مسندة بالفعل لمشوار مفتوح (${openTrips[0].tripType}). هل تريد سحبها للمشوار الطارئ رغم ذلك؟`
            : `Warning: the selected vehicle is already assigned to an open trip (${openTrips[0].tripType}). Reassign it to this emergency trip anyway?`
        );
        return;
      }
    }

    try {
      setSubmitting(true);
      await FleetBusinessEngine.createEmergencyTrip(
        companyId,
        activeUserId,
        {
          vehicle_id: selectedVehicleId,
          driver_id: selectedDriverName || 'سائق طوارئ',
          task_type: taskType.trim(),
          org_unit_id: selectedOrgUnitId,
          notes: notes.trim(),
          startLocationLabel: startLocationLabel.trim() || 'نقطة الانطلاق',
          destinationLabel: destinationLabel.trim() || taskType.trim(),
          destLat,
          destLng,
          confirmDespiteConflict: confirmed,
          conflictOverrideReason: overrideReason.trim()
        }
      );

      onSuccess();
      onClose();
    } catch (err) {
      console.error('Failed to create emergency trip:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-xl border border-rose-200 dark:border-rose-900/80 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-rose-100 dark:border-rose-950">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-rose-500 text-white rounded-2xl shadow-md animate-pulse">
              <Siren className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-slate-900 dark:text-white text-base">
                  {isRtl ? 'إنشاء مشوار طارئ داخلي' : 'New Internal Emergency Trip'}
                </h3>
                <span className="px-2 py-0.5 text-[9px] font-black rounded-full bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300">
                  {isRtl ? 'عاجل جداً' : 'Urgent'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isRtl ? 'إرسال سريع ومباشر من داخل النظام مع تسجيل GPS للسائق' : 'Fast internal dispatch with driver GPS tracking.'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <div className="space-y-3.5">
          {/* Quick presets */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              {isRtl ? 'نوع المهمة الطارئة:' : 'Emergency Task Type:'}
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {EMERGENCY_PRESETS.map(preset => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setTaskType(preset)}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-xl border transition-all ${
                    taskType === preset
                      ? 'bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border-rose-300'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={taskType}
              onChange={e => setTaskType(e.target.value)}
              placeholder={isRtl ? 'أو اكتب وصف المهمة الطارئة...' : 'Or enter custom task...'}
              className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
            />
          </div>

          {/* Org Unit / Region */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              {isRtl ? 'المنطقة / الفرع:' : 'Region / Branch:'}
            </label>
            <select
              value={selectedOrgUnitId}
              onChange={e => setSelectedOrgUnitId(e.target.value)}
              className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
            >
              {orgUnits.map(unit => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </select>
          </div>

          {/* Learned Location Suggestions for this task + region */}
          {suggestedLocations.length > 0 && (
            <div className="p-3 bg-indigo-50/70 dark:bg-indigo-950/40 rounded-2xl border border-indigo-200/80 dark:border-indigo-800/60 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold text-indigo-900 dark:text-indigo-200 flex items-center gap-1">
                  <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                  {isRtl ? 'مواقع متعلمة سابقة لنفس المهمة بهذه المنطقة:' : 'Learned locations for this task in this region:'}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {suggestedLocations.map((loc, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectSuggestedLocation(loc)}
                    className="px-2.5 py-1 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 text-[11px] font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 flex items-center gap-1 shadow-xs"
                  >
                    <MapPin className="h-3 w-3 text-indigo-500" />
                    <span>{loc.label}</span>
                    <span className="text-[9px] opacity-70 font-mono">({loc.lat.toFixed(3)}, {loc.lng.toFixed(3)})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Destination */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                {isRtl ? 'نقطة الانطلاق:' : 'Start point:'}
              </label>
              <input
                type="text"
                value={startLocationLabel}
                onChange={e => setStartLocationLabel(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                {isRtl ? 'عنوان / موقع المهمة:' : 'Destination label:'}
              </label>
              <input
                type="text"
                value={destinationLabel}
                onChange={e => setDestinationLabel(e.target.value)}
                placeholder={taskType}
                className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          {/* Vehicle and Driver selection */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isRtl ? 'المركبة المتاحة:' : 'Available Vehicle:'}
                </label>
                <button
                  type="button"
                  onClick={handlePickNearestVehicle}
                  className="text-[10px] text-emerald-600 font-bold hover:underline flex items-center gap-0.5"
                >
                  <Sparkles className="h-2.5 w-2.5" />
                  {isRtl ? 'الأقرب' : 'Nearest'}
                </button>
              </div>
              <select
                value={selectedVehicleId}
                onChange={e => handleVehicleChange(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              >
                {activeVehicles.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.plateNumber} ({v.make}) - {v.driverName || 'بدون سائق'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                {isRtl ? 'السائق المكلف:' : 'Assigned Driver:'}
              </label>
              <input
                type="text"
                value={selectedDriverName}
                onChange={e => setSelectedDriverName(e.target.value)}
                placeholder={isRtl ? 'اسم السائق' : 'Driver name'}
                className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              {isRtl ? 'ملاحظات وتفاصيل المهمة الطارئة:' : 'Emergency details / notes:'}
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={isRtl ? 'تفاصيل عاجلة للسائق...' : 'Urgent instructions for the driver...'}
              className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
            />
          </div>
        </div>

        {busyVehicleWarning && (
          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-2xl space-y-2">
            <p className="text-xs font-bold text-amber-900 dark:text-amber-300">{busyVehicleWarning}</p>
            <input
              type="text"
              value={overrideReason}
              onChange={e => setOverrideReason(e.target.value)}
              placeholder={isRtl ? 'سبب السحب من المشوار الآخر (إجباري)' : 'Reason for pulling this vehicle (required)'}
              className="w-full text-xs px-3 py-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setBusyVehicleWarning(null)}
                className="flex-1 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl"
              >
                {isRtl ? 'رجوع واختيار مركبة أخرى' : 'Back / choose another vehicle'}
              </button>
              <button
                type="button"
                disabled={!overrideReason.trim() || submitting}
                onClick={() => handleCreate(true)}
                className="flex-1 py-2 text-xs font-black bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl"
              >
                {isRtl ? 'تأكيد السحب رغم الانشغال' : 'Confirm anyway'}
              </button>
            </div>
          </div>
        )}

        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl"
          >
            {isRtl ? 'إلغاء' : 'Cancel'}
          </button>
          <button
            type="button"
            disabled={!taskType.trim() || !selectedVehicleId || submitting}
            onClick={() => handleCreate(false)}
            className="flex-1 py-2.5 text-xs font-bold bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl shadow-md flex items-center justify-center gap-1.5"
          >
            <Siren className="h-4 w-4" />
            <span>
              {submitting
                ? (isRtl ? 'جاري الإرسال...' : 'Dispatching...')
                : (isRtl ? 'إرسال المشوار الطارئ فوراً' : 'Dispatch Emergency Trip')}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
