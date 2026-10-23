import { describe, it, expect, beforeEach } from 'vitest';
import { StorageEngine } from './db/storage';
import { FleetBusinessEngine } from './lib/enterprise/fleet_engine';
import { Vehicle, Trip } from './types/fleet';

describe('Fleet Learned Locations, Emergency Trips & Breakdown Decisions Suite', () => {
  const companyA = 'comp-delta-corp';
  const companyB = 'comp-other-enterprise';
  const cairoBranch = 'org-cairo-branch';
  const alexBranch = 'org-alex-branch';

  beforeEach(() => {
    StorageEngine.setStored('fleet_vehicles_items', []);
    StorageEngine.setStored('fleet_trips_items', []);
    StorageEngine.setStored('fleet_learned_locations_items', []);
    StorageEngine.cache = {};
  });

  it('1. should record learned locations keyed by company_id + org_unit_id + task_type', async () => {
    // Record first location for gas cylinders in Cairo
    const loc1 = await FleetBusinessEngine.recordLearnedLocation(
      companyA,
      cairoBranch,
      'تغيير اسطوانات غاز / أنابيب',
      {
        label: 'مستودع غاز التجمع الخامس',
        lat: 30.0131,
        lng: 31.4322,
        tripId: 'trip-001'
      }
    );

    expect(loc1).toBeDefined();
    expect(loc1?.visitCount).toBe(1);
    expect(loc1?.history).toHaveLength(1);

    // Record second location for gas cylinders in Cairo
    const loc2 = await FleetBusinessEngine.recordLearnedLocation(
      companyA,
      cairoBranch,
      'تغيير اسطوانات غاز / أنابيب',
      {
        label: 'مستودع غاز المعادي',
        lat: 29.9602,
        lng: 31.2569,
        tripId: 'trip-002'
      }
    );

    expect(loc2?.visitCount).toBe(2);
    expect(loc2?.history).toHaveLength(2);

    // Retrieve suggestions for Cairo
    const suggestionsCairo = FleetBusinessEngine.getSuggestedLocationsForTask(
      companyA,
      cairoBranch,
      'تغيير اسطوانات غاز / أنابيب'
    );

    expect(suggestionsCairo.length).toBeGreaterThanOrEqual(2);
    expect(suggestionsCairo[0].label).toContain('المعادي');
  });

  it('2. should enforce strict Multi-tenant and Org Unit isolation for learned locations', async () => {
    // Record location in Alex for Company A
    await FleetBusinessEngine.recordLearnedLocation(
      companyA,
      alexBranch,
      'بوسطة ومراسلات',
      { label: 'بريد المنشية - الإسكندرية', lat: 31.1985, lng: 29.8967 }
    );

    // Record location in Cairo for Company B
    await FleetBusinessEngine.recordLearnedLocation(
      companyB,
      cairoBranch,
      'بوسطة ومراسلات',
      { label: 'بريد العتبة - القاهرة', lat: 30.0526, lng: 31.2468 }
    );

    // Check Cairo in Company A: should return 0 suggestions
    const suggestionsCairoCompA = FleetBusinessEngine.getSuggestedLocationsForTask(
      companyA,
      cairoBranch,
      'بوسطة ومراسلات'
    );
    expect(suggestionsCairoCompA).toHaveLength(0);

    // Check Alex in Company A: should return Alex branch
    const suggestionsAlexCompA = FleetBusinessEngine.getSuggestedLocationsForTask(
      companyA,
      alexBranch,
      'بوسطة ومراسلات'
    );
    expect(suggestionsAlexCompA).toHaveLength(1);
    expect(suggestionsAlexCompA[0].label).toBe('بريد المنشية - الإسكندرية');

    // Check Cairo in Company B: should return Company B's location
    const suggestionsCairoCompB = FleetBusinessEngine.getSuggestedLocationsForTask(
      companyB,
      cairoBranch,
      'بوسطة ومراسلات'
    );
    expect(suggestionsCairoCompB).toHaveLength(1);
    expect(suggestionsCairoCompB[0].label).toBe('بريد العتبة - القاهرة');
  });

  it('3. should auto-learn location when driver records stop arrival via GPS', async () => {
    const vehicle: Vehicle = {
      id: 'veh-pickup-1',
      company_id: companyA,
      code: 'VH-101',
      plateNumber: 'ق هـ و 456',
      type: 'PICKUP',
      make: 'Toyota',
      model: 'Hilux',
      year: 2023,
      status: 'ACTIVE',
      odometerReading: 5000,
      fuelCapacity: 80,
      createdAt: new Date().toISOString()
    };
    StorageEngine.setStored('fleet_vehicles_items', [vehicle]);

    const trip = await FleetBusinessEngine.createTrip(companyA, 'office-admin', {
      vehicle_id: 'veh-pickup-1',
      driver_id: 'driver-sayed',
      tripType: 'صيانة فلاتر',
      scheduledAt: new Date().toISOString(),
      stops: [
        {
          id: 'stop-start-1',
          sequence: 1,
          taskTitle: 'نقطة الانطلاق',
          location: { label: 'المخزن', org_unit_id: cairoBranch },
          status: 'PENDING'
        },
        {
          id: 'stop-auto-1',
          sequence: 2,
          taskTitle: 'صيانة محطة مياه',
          location: { label: 'محطة تنقية المياه المركزية', org_unit_id: cairoBranch },
          status: 'PENDING'
        }
      ],
      org_unit_id: cairoBranch
    });

    // Start trip
    await FleetBusinessEngine.startTrip(companyA, 'driver-sayed', trip.id, {
      lat: 30.0444,
      lng: 31.2357,
      label: 'نقطة الانطلاق'
    });

    // Driver arrives at stop with GPS coordinates
    const arrival = await FleetBusinessEngine.recordStopArrival(
      companyA,
      'driver-sayed',
      trip.id,
      'stop-auto-1',
      {
        lat: 30.1287,
        lng: 31.3654,
        accuracy: 12,
        label: 'موقع صيانة المحطة بالعباسية'
      }
    );

    expect(arrival.stop?.status).toBe('ARRIVED');
    expect(arrival.stop?.arrivedLocation?.lat).toBe(30.1287);

    // Verify auto-learned location is indexed under companyA + cairoBranch + 'صيانة محطة مياه'
    const learned = FleetBusinessEngine.getSuggestedLocationsForTask(
      companyA,
      cairoBranch,
      'صيانة محطة مياه'
    );
    expect(learned.length).toBeGreaterThanOrEqual(1);
    expect(learned[0].lat).toBe(30.1287);
    expect(learned[0].lng).toBe(31.3654);
  });

  it('4. should create fast internal emergency trips without external dependencies', async () => {
    const emergencyTrip = await FleetBusinessEngine.createEmergencyTrip(
      companyA,
      'ops-officer',
      {
        vehicle_id: 'veh-emergency-1',
        driver_id: 'driver-emergency-ahmed',
        task_type: 'تغيير اسطوانات غاز طارئ',
        org_unit_id: cairoBranch,
        notes: 'طوارئ: انقطاع الغاز في المستشفى الميداني',
        startLocationLabel: 'المقر الرئيسي',
        destinationLabel: 'المستشفى الميداني - مدينة نصر',
        destLat: 30.0612,
        destLng: 31.3358
      }
    );

    expect(emergencyTrip.isEmergency).toBe(true);
    expect(emergencyTrip.status).toBe('DISPATCHED');
    expect(emergencyTrip.stops).toHaveLength(2);
    expect(emergencyTrip.stops[1].taskTitle).toBe('تغيير اسطوانات غاز طارئ');
    expect(emergencyTrip.stops[1].location.lat).toBe(30.0612);

    const storedTrips = FleetBusinessEngine.getTripsByCompany(companyA);
    expect(storedTrips.some(t => t.id === emergencyTrip.id && t.isEmergency)).toBe(true);
  });

  it('5. should support full supervisor breakdown decision workflow: REASSIGN, POSTPONE, SUSPEND', async () => {
    const brokenVehicle: Vehicle = {
      id: 'veh-broken-1',
      company_id: companyA,
      code: 'VH-BRK',
      plateNumber: 'ع ط ل 999',
      type: 'TRUCK',
      make: 'Volvo',
      model: 'FH',
      year: 2021,
      status: 'BREAKDOWN',
      odometerReading: 80000,
      fuelCapacity: 400,
      createdAt: new Date().toISOString()
    };

    const targetVehicle: Vehicle = {
      id: 'veh-avail-2',
      company_id: companyA,
      code: 'VH-AVL',
      plateNumber: 'ج هـ ز 111',
      type: 'TRUCK',
      make: 'Mercedes',
      model: 'Actros',
      year: 2023,
      status: 'ACTIVE',
      driverName: 'السائق البديل حسام',
      odometerReading: 20000,
      fuelCapacity: 300,
      createdAt: new Date().toISOString()
    };

    StorageEngine.setStored('fleet_vehicles_items', [brokenVehicle, targetVehicle]);

    // Trip 1: To be Reassigned
    const trip1 = await FleetBusinessEngine.createTrip(companyA, 'supervisor-1', {
      vehicle_id: 'veh-broken-1',
      driver_id: 'driver-orig-1',
      tripType: 'توصيل شحنة 1',
      scheduledAt: new Date().toISOString(),
      stops: [
        { id: 's1-start', sequence: 1, taskTitle: 'نقطة الانطلاق', location: { label: 'المستودع' }, status: 'PENDING' },
        { id: 's1', sequence: 2, taskTitle: 'تسليم بضاعة', location: { label: 'العميل أ' }, status: 'PENDING' }
      ]
    });

    // Trip 2: To be Postponed
    const trip2 = await FleetBusinessEngine.createTrip(companyA, 'supervisor-1', {
      vehicle_id: 'veh-broken-1',
      driver_id: 'driver-orig-1',
      tripType: 'توصيل شحنة 2',
      scheduledAt: new Date().toISOString(),
      stops: [
        { id: 's2-start', sequence: 1, taskTitle: 'نقطة الانطلاق', location: { label: 'المستودع' }, status: 'PENDING' },
        { id: 's2', sequence: 2, taskTitle: 'استلام بضاعة', location: { label: 'المورد ب' }, status: 'PENDING' }
      ]
    });

    // Trip 3: To be Suspended
    const trip3 = await FleetBusinessEngine.createTrip(companyA, 'supervisor-1', {
      vehicle_id: 'veh-broken-1',
      driver_id: 'driver-orig-1',
      tripType: 'توصيل شحنة 3',
      scheduledAt: new Date().toISOString(),
      stops: [
        { id: 's3-start', sequence: 1, taskTitle: 'نقطة الانطلاق', location: { label: 'المستودع' }, status: 'PENDING' },
        { id: 's3', sequence: 2, taskTitle: 'نقل عهدة', location: { label: 'الفرع ج' }, status: 'PENDING' }
      ]
    });

    // Decision 1: REASSIGN Trip 1 to veh-avail-2 with flexible driver assignment
    const reassignedTrip = await FleetBusinessEngine.executeBreakdownDecision(
      companyA,
      'supervisor-1',
      {
        tripId: trip1.id,
        decision: 'REASSIGN',
        fromVehicleId: 'veh-broken-1',
        toVehicleId: 'veh-avail-2',
        toDriverId: 'السائق حسام محمد',
        reason: 'عطل مفاجئ في المحرك وتم التحويل لأقرب مركبة جاهزة'
      }
    );

    expect(reassignedTrip.vehicle_id).toBe('veh-avail-2');
    expect(reassignedTrip.driver_id).toBe('السائق حسام محمد');
    expect(reassignedTrip.reassignedFromVehicleId).toBe('veh-broken-1');
    expect(reassignedTrip.breakdownDecisions).toHaveLength(1);
    expect(reassignedTrip.breakdownDecisions?.[0].decision).toBe('REASSIGN');

    // Decision 2: POSTPONE Trip 2
    const postponedUntilDate = '2026-08-25T10:00:00Z';
    const postponedTrip = await FleetBusinessEngine.executeBreakdownDecision(
      companyA,
      'supervisor-1',
      {
        tripId: trip2.id,
        decision: 'POSTPONE',
        fromVehicleId: 'veh-broken-1',
        reason: 'تأجيل لحين انتهاء صيانة المركبة',
        postponedUntil: postponedUntilDate
      }
    );

    expect(postponedTrip.status).toBe('POSTPONED');
    expect(postponedTrip.postponedUntil).toBe(postponedUntilDate);

    // Decision 3: SUSPEND Trip 3
    const suspendedTrip = await FleetBusinessEngine.executeBreakdownDecision(
      companyA,
      'supervisor-1',
      {
        tripId: trip3.id,
        decision: 'SUSPEND',
        fromVehicleId: 'veh-broken-1',
        reason: 'تعليق في انتظار موافقة الإدارة'
      }
    );

    expect(suspendedTrip.status).toBe('SUSPENDED_BREAKDOWN');
    expect(suspendedTrip.breakdownDecisions?.[0].decision).toBe('SUSPEND');
  });
});
