/**
 * AN-INV-PILOT-1 — POST /api/an/inventory/pilot/movement
 * Chain: operator auth -> company scope -> flag gate -> fail-closed company adapter -> Idempotency-Key -> post.
 * No backend override from the request body (company config only).
 */
import type { StorageRouter } from '../an-core/storage/StorageRouter';
import { isPilotWritesEnabled, postPilotMovement } from './anInventoryPilot';
import { extractIdempotencyKey, requireIdempotencyKey } from './anMigrateIdempotency';

export interface PilotRouteDeps {
  router: StorageRouter;
  adminDb: any;
  requireOperator: (req: any, res: any) => Promise<boolean>;
  assertCompanyScope: (user: any, companyId: string) => Promise<any>;
}

export function mountAnInventoryPilotRoute(app: any, deps: PilotRouteDeps): void {
  app.post('/api/an/inventory/pilot/movement', async (req: any, res: any) => {
    try {
      if (!(await deps.requireOperator(req, res))) return;
      const companyId = String(req.body?.companyId || req.query?.companyId || '').trim();
      if (!companyId) return res.status(400).json({ ok: false, error: 'companyId required' });
      const scope: any = await deps.assertCompanyScope(req.anMigrateUser, companyId);
      if (!scope.ok) {
        return res.status(scope.status).json({ ok: false, code: scope.code, message: scope.message, messageAr: scope.messageAr });
      }
      if (!isPilotWritesEnabled(process.env)) {
        return res.status(403).json({
          ok: false,
          plane: 'an-inv-pilot-1',
          code: 'pilot_writes_disabled',
          writesEnabled: false,
          writesPerformed: false,
          cutoverApproved: false,
          message: 'AN_INV_PILOT_WRITES not enabled',
          messageAr: 'كتابة الطيار معطّلة',
        });
      }
      if (req.body?.backend !== undefined) {
        return res.status(400).json({ ok: false, code: 'backend_override_not_allowed', message: 'pilot uses company backend config only' });
      }
      const { loadCompanyLikeFromFirestore, resolveCompanyStorageAdapter, isAdapterFailClosedEnv } = await import('./anResolveCompanyAdapter');
      const loadResult = await loadCompanyLikeFromFirestore(deps.adminDb || null, companyId);
      if (loadResult.status === 'error' && isAdapterFailClosedEnv(process.env)) {
        return res.status(503).json({
          ok: false,
          code: 'adapter_company_load_failed',
          message: loadResult.message || 'Company config load failed',
          messageAr: 'تعذر تحميل إعدادات قاعدة بيانات الشركة — لن يتم التوجيه الصامت للقاعدة الأساسية',
        });
      }
      const companyLike = loadResult.status === 'loaded' ? loadResult.company : null;
      let resolved: any;
      try {
        resolved = resolveCompanyStorageAdapter(deps.router, companyId, companyLike, null, {
          loadStatus: loadResult,
          failClosed: isAdapterFailClosedEnv(process.env),
          requireLoaded: true,
        });
      } catch (e: any) {
        return res.status(400).json({ ok: false, code: 'adapter_resolve_failed', message: e?.message || String(e) });
      }
      const keyCheck: any = requireIdempotencyKey(extractIdempotencyKey(req));
      if (!keyCheck.ok) {
        return res.status(keyCheck.status).json({ ok: false, code: keyCheck.code || 'idempotency_key_required', message: keyCheck.message, messageAr: keyCheck.messageAr });
      }
      const actor = req.anMigrateUser || {};
      const result = await postPilotMovement(resolved.adapter, {
        input: {
          companyId,
          warehouseId: req.body?.warehouseId,
          itemId: req.body?.itemId,
          movementType: req.body?.movementType,
          quantity: req.body?.quantity,
          unitCost: req.body?.unitCost,
          notes: req.body?.notes,
        },
        batchIdempotencyKey: keyCheck.key,
        actorId: String(actor.id || actor.email || 'inv-pilot-1'),
        actorName: String(actor.full_name || actor.email || 'inv-pilot-1'),
      });
      return res.status(result.httpStatus).json({
        ...result,
        adapterResolution: {
          source: resolved.source,
          adapterType: resolved.adapterType,
          isolationLevel: resolved.isolationLevel,
          connectionRef: resolved.connectionRef,
        },
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
  });
}
