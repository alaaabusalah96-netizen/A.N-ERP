/**
 * Shared cumulative stock-return guard (pure).
 * Used by InventoryService pre-checks and by adapters inside the atomic post path.
 */
export type QtyMap = Map<string, number>;

export function sumLinesByItem(lines: Array<{ itemId: string; quantity: number }> | undefined | null): QtyMap {
  const m = new Map<string, number>();
  for (const l of lines || []) {
    const id = l.itemId;
    m.set(id, (m.get(id) || 0) + Number(l.quantity));
  }
  return m;
}

export function assertReturnTypeMatchesOriginal(
  returnType: 'RETURN_RECEIPT' | 'RETURN_ISSUE',
  originalDocumentType: string,
): { ok: true; detail?: string } | { ok: false; detail: string } {
  const expect = returnType === 'RETURN_RECEIPT' ? 'RECEIPT' : 'ISSUE';
  if (originalDocumentType !== expect) {
    return {
      ok: false,
      detail: `المرتجع ${returnType} يتطلب مستندًا أصليًا من نوع ${expect}، والمستند من نوع ${originalDocumentType}.`,
    };
  }
  return { ok: true };
}

/** req + prior must not exceed original per item */
export function assertCumulativeWithinOriginal(
  origByItem: QtyMap,
  priorByItem: QtyMap,
  reqByItem: QtyMap,
): { ok: true; itemId?: string; detail?: string } | { ok: false; itemId: string; detail: string } {
  for (const [itemId, reqQty] of reqByItem) {
    if (!origByItem.has(itemId)) {
      return { ok: false, itemId, detail: `الصنف ${itemId} ليس جزءاً من المستند الأصلي.` };
    }
    const origQty = origByItem.get(itemId) || 0;
    const priorQty = priorByItem.get(itemId) || 0;
    const remaining = Math.round((origQty - priorQty) * 1000) / 1000;
    if (reqQty > remaining + 1e-9) {
      return {
        ok: false,
        itemId,
        detail: `الصنف ${itemId}: المطلوب (${reqQty}) + السابق (${priorQty}) يتجاوز الأصل (${origQty}). المتبقي: ${Math.max(0, remaining)}.`,
      };
    }
  }
  return { ok: true };
}

/** available stock must cover total requested per item */
export function assertStockCoversRequest(
  availableByItem: QtyMap,
  reqByItem: QtyMap,
): { ok: true; itemId?: string; detail?: string } | { ok: false; itemId: string; detail: string } {
  for (const [itemId, reqQty] of reqByItem) {
    const avail = availableByItem.get(itemId) || 0;
    if (avail < reqQty) {
      return {
        ok: false,
        itemId,
        detail: `الرصيد المتاح (${avail}) لا يكفي لإرجاع إجمالي (${reqQty}) للصنف ${itemId}.`,
      };
    }
  }
  return { ok: true };
}

/** Original stock document must be POSTED (not draft/cancelled). */
export function assertOriginalPosted(status: string): { ok: true; detail?: string } | { ok: false; detail: string } {
  if (status !== 'POSTED') {
    return {
      ok: false,
      detail: `لا يمكن إنشاء مرتجع لمستند حالته ${status || 'غير معروفة'}؛ يجب أن يكون المستند الأصلي مرحّلاً (POSTED).`,
    };
  }
  return { ok: true };
}
