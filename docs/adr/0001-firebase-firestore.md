# ADR 0001: Firebase Firestore Selection
# قرار التصميم رقم 0001: اختيار قاعدة بيانات فايرستور

## Status / الحالة
Accepted (Frozen) / مقبول ومثبت

---

## Context / السياق
The application requires a highly responsive database layer capable of synchronization across multiple devices, offline resilience, and fast real-time event streaming for branch operators and regional managers approving financial movements.

---

## Decision / القرار المعماري
We utilize **Google Cloud Firestore** as our primary document database coupled with client-side listeners for live real-time synchronization.

---

## Justification & Pros / المبررات والإيجابيات
1. **Real-time Synchronization / المزامنة اللحظية**:
   - Firestore's native websocket subscription model enables immediate layout updates when vouchers are updated or approved across regions.
2. **Offline-first Capabilities / العمل دون اتصال**:
   - Offers robust caching layers so that branches in weak network regions can queue transactions and synchronize them upon connection recovery.
3. **No Cold-Start Latency for DB / سرعة الاستجابة**:
   - High horizontal scaling allows near-instant reads and writes with zero database connection pooling issues typical of relational DBs under high traffic.
4. **Schemaless Flexibility / مرونة هيكل البيانات**:
   - Simplifies the addition of localized metadata, audit payloads, and multi-tenant metrics without tedious migration table blockages.

---

## Cons & Mitigations / العيوب وكيفية التعامل معها
- **Querying Constraints / قيود الاستعلام المعقدة**:
  - *Con*: Firestore does not natively support complex multi-table joins or relational operations.
  - *Mitigation*: We structure the models to run denormalized reference fields (like caching `station_name` in legacy transaction archives) and perform explicit client-side/server-side lookup bindings.
