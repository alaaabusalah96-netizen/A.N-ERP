import React, { useEffect, useState } from 'react';
import { BookOpen, Save, AlertCircle, Paperclip } from 'lucide-react';

interface LedgerDepthViewProps {
  onNotification: (msg: string) => void;
}

export const LedgerDepthView: React.FC<LedgerDepthViewProps> = ({ onNotification }) => {
  const [tab, setTab] = useState<'close' | 'recon' | 'docs' | 'attach'>('close');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusJson, setStatusJson] = useState('');
  const [periodId, setPeriodId] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [reconJson, setReconJson] = useState('');
  const [docsJson, setDocsJson] = useState('');
  const [docId, setDocId] = useState('');
  const [attachDocType, setAttachDocType] = useState('JOURNAL_ENTRY');
  const [attachDocId, setAttachDocId] = useState('');
  const [attachList, setAttachList] = useState('');
  const [fileUrl, setFileUrl] = useState('https://example.com/file.pdf');
  const [fileName, setFileName] = useState('file.pdf');
  const [mimeType, setMimeType] = useState('application/pdf');
  const [fileSize, setFileSize] = useState(1024);

  const idem = () =>
    (typeof crypto !== 'undefined' && crypto.randomUUID && crypto.randomUUID()) ||
    `ld-${Date.now()}`;

  const loadCloseStatus = async () => {
    try {
      const res = await fetch('/api/accounting/entity-close-status', { credentials: 'include' });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.detail || 'تعذر جلب حالة الإقفال');
        return;
      }
      setStatusJson(JSON.stringify(data?.data ?? data, null, 2));
    } catch {
      setError('تعذر الاتصال أثناء جلب حالة الإقفال');
    }
  };

  useEffect(() => {
    loadCloseStatus();
  }, []);

  const closeEntity = async () => {
    setError(null);
    setBusy(true);
    try {
      const key = idem();
      const res = await fetch('/api/accounting/entity-close', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({ periodId, idempotencyKey: key }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.detail || data?.title || 'فشل إقفال الكيان');
        return;
      }
      onNotification('تم إقفال الكيان');
      await loadCloseStatus();
    } catch {
      setError('تعذر الاتصال أثناء الإقفال');
    } finally {
      setBusy(false);
    }
  };

  const reopenEntity = async () => {
    setError(null);
    setBusy(true);
    try {
      const key = idem();
      const res = await fetch('/api/accounting/entity-reopen', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({ reason: reopenReason, idempotencyKey: key }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.detail || data?.title || 'فشل إعادة الفتح');
        return;
      }
      onNotification('تم إعادة فتح الكيان');
      await loadCloseStatus();
    } catch {
      setError('تعذر الاتصال أثناء إعادة الفتح');
    } finally {
      setBusy(false);
    }
  };

  const loadRecon = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/inventory/reconciliation', { credentials: 'include' });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.detail || 'فشل تقرير المطابقة');
        return;
      }
      setReconJson(JSON.stringify(data?.data ?? data, null, 2));
      onNotification('تم تحميل مطابقة المخزن×الدفتر');
    } catch {
      setError('تعذر الاتصال أثناء المطابقة');
    } finally {
      setBusy(false);
    }
  };

  const loadDocs = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/inventory/documents', { credentials: 'include' });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.detail || 'فشل جلب مستندات المخزون');
        return;
      }
      setDocsJson(JSON.stringify(data?.data ?? data, null, 2));
    } catch {
      setError('تعذر الاتصال أثناء جلب المستندات');
    } finally {
      setBusy(false);
    }
  };

  const postJournal = async () => {
    if (!docId.trim()) {
      setError('أدخل معرّف المستند');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const key = idem();
      const res = await fetch(`/api/inventory/documents/${encodeURIComponent(docId.trim())}/post-journal`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Idempotency-Key': key },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.detail || data?.title || 'فشل ترحيل القيد');
        return;
      }
      onNotification('تم ترحيل قيد مستند المخزون');
    } catch {
      setError('تعذر الاتصال أثناء ترحيل القيد');
    } finally {
      setBusy(false);
    }
  };

  const loadAttachments = async () => {
    setError(null);
    setBusy(true);
    try {
      const q = `documentType=${encodeURIComponent(attachDocType)}&documentId=${encodeURIComponent(attachDocId)}`;
      const res = await fetch(`/api/attachments?${q}`, { credentials: 'include' });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.detail || 'فشل جلب المرفقات');
        return;
      }
      setAttachList(JSON.stringify(data?.data ?? data, null, 2));
    } catch {
      setError('تعذر الاتصال أثناء جلب المرفقات');
    } finally {
      setBusy(false);
    }
  };

  const addAttachment = async () => {
    setError(null);
    setBusy(true);
    try {
      const key = idem();
      const res = await fetch('/api/attachments', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({
          documentType: attachDocType,
          documentId: attachDocId,
          fileUrl,
          fileName,
          mimeType,
          fileSize,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.detail || data?.title || 'فشل إضافة المرفق');
        return;
      }
      onNotification('تمت إضافة المرفق');
      await loadAttachments();
    } catch {
      setError('تعذر الاتصال أثناء إضافة المرفق');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-blue-700" />
          تعميق الدفتر: إقفال، مطابقة، مستندات، مرفقات
        </h2>
        <p className="text-xs text-slate-500 mt-1">شاشات فوق APIs الجاهزة دون تغيير الخادم.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['close', 'إقفال الكيان'],
            ['recon', 'مطابقة مخزن×دفتر'],
            ['docs', 'مستندات المخزون'],
            ['attach', 'مرفقات'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`px-4 py-2 rounded-xl text-xs font-bold ${
              tab === id ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-100 rounded-xl p-3">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {tab === 'close' && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-3 text-xs">
          <button type="button" onClick={loadCloseStatus} className="text-blue-700 font-bold">
            تحديث الحالة
          </button>
          {statusJson && (
            <pre className="bg-slate-50 border border-slate-100 rounded-xl p-3 overflow-auto max-h-48 text-[11px]">
              {statusJson}
            </pre>
          )}
          <input
            className="w-full border border-slate-200 rounded-xl px-3 py-2"
            placeholder="periodId / code"
            value={periodId}
            onChange={(e) => setPeriodId(e.target.value)}
          />
          <button
            type="button"
            disabled={busy}
            onClick={closeEntity}
            className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white font-bold rounded-xl"
          >
            <Save className="w-4 h-4" /> إقفال الكيان
          </button>
          <input
            className="w-full border border-slate-200 rounded-xl px-3 py-2"
            placeholder="سبب إعادة الفتح"
            value={reopenReason}
            onChange={(e) => setReopenReason(e.target.value)}
          />
          <button
            type="button"
            disabled={busy}
            onClick={reopenEntity}
            className="px-4 py-2 bg-slate-800 text-white font-bold rounded-xl"
          >
            إعادة فتح
          </button>
        </div>
      )}

      {tab === 'recon' && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-3 text-xs">
          <button
            type="button"
            disabled={busy}
            onClick={loadRecon}
            className="px-4 py-2 bg-blue-700 text-white font-bold rounded-xl"
          >
            تشغيل المطابقة
          </button>
          {reconJson && (
            <pre className="bg-slate-50 border border-slate-100 rounded-xl p-3 overflow-auto max-h-96 text-[11px]">
              {reconJson}
            </pre>
          )}
        </div>
      )}

      {tab === 'docs' && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-3 text-xs">
          <button type="button" disabled={busy} onClick={loadDocs} className="px-4 py-2 bg-blue-700 text-white font-bold rounded-xl">
            جلب المستندات
          </button>
          {docsJson && (
            <pre className="bg-slate-50 border border-slate-100 rounded-xl p-3 overflow-auto max-h-64 text-[11px]">
              {docsJson}
            </pre>
          )}
          <input
            className="w-full border border-slate-200 rounded-xl px-3 py-2"
            placeholder="معرّف مستند للترحيل"
            value={docId}
            onChange={(e) => setDocId(e.target.value)}
          />
          <button type="button" disabled={busy} onClick={postJournal} className="px-4 py-2 bg-emerald-700 text-white font-bold rounded-xl">
            ترحيل قيد المستند
          </button>
        </div>
      )}

      {tab === 'attach' && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-3 text-xs">
          <p className="font-bold flex items-center gap-2">
            <Paperclip className="w-4 h-4" /> مرفقات المستند
          </p>
          <input
            className="w-full border border-slate-200 rounded-xl px-3 py-2"
            placeholder="documentType"
            value={attachDocType}
            onChange={(e) => setAttachDocType(e.target.value)}
          />
          <input
            className="w-full border border-slate-200 rounded-xl px-3 py-2"
            placeholder="documentId"
            value={attachDocId}
            onChange={(e) => setAttachDocId(e.target.value)}
          />
          <button type="button" disabled={busy} onClick={loadAttachments} className="px-4 py-2 bg-slate-700 text-white font-bold rounded-xl">
            عرض المرفقات
          </button>
          {attachList && (
            <pre className="bg-slate-50 border border-slate-100 rounded-xl p-3 overflow-auto max-h-48 text-[11px]">
              {attachList}
            </pre>
          )}
          <input className="w-full border border-slate-200 rounded-xl px-3 py-2" value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} placeholder="fileUrl" />
          <input className="w-full border border-slate-200 rounded-xl px-3 py-2" value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder="fileName" />
          <input className="w-full border border-slate-200 rounded-xl px-3 py-2" value={mimeType} onChange={(e) => setMimeType(e.target.value)} placeholder="mimeType" />
          <input type="number" className="w-full border border-slate-200 rounded-xl px-3 py-2" value={fileSize} onChange={(e) => setFileSize(Number(e.target.value))} placeholder="fileSize" />
          <button type="button" disabled={busy} onClick={addAttachment} className="px-4 py-2 bg-blue-700 text-white font-bold rounded-xl">
            إضافة مرفق
          </button>
        </div>
      )}
    </div>
  );
};
