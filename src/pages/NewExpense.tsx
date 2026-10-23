import React, { useState, useEffect } from 'react';
import { CustodyDB } from '../db';
import { useScreenListeners } from '../firebase';
import { translations, Language, Theme, Transaction, Attachment, ExpenseCategory } from '../types';
import { getArabicTafqeet, getEnglishTafqeet } from '../utils/tafqeet';
import { 
  PlusCircle, Calendar, FileText, DollarSign, FilePlus2, 
  CheckCircle2, Plus, Trash2, Coins, Paperclip, UploadCloud, 
  FileIcon, X, HelpCircle, ArrowLeft, PenSquare, Save, ChevronRight, Tag
} from 'lucide-react';

interface NewExpenseProps {
  language: Language;
  theme: Theme;
  onNavigate: (tab: string) => void;
}

interface ItemInput {
  description: string;
  amount: string;
  sign: '+' | '-';
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export default function NewExpense({ language, theme, onNavigate }: NewExpenseProps) {
  useScreenListeners(['transactions', 'Expenses']);

  const t = translations[language];
  const isRtl = language === 'ar';

  const activeUser = CustodyDB.getActiveUser();
  const scopedStations = CustodyDB.getStationsForUser(activeUser);

  // Form states
  const [stationId, setStationId] = useState<string>(() => {
    if (activeUser?.station_id) return activeUser.station_id;
    if (scopedStations.length > 0) return scopedStations[0].id;
    return '';
  });
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [categories] = useState<ExpenseCategory[]>(() => CustodyDB.getCategories());
  const [categoryId, setCategoryId] = useState<string>('cat-6');
  const [items, setItems] = useState<ItemInput[]>([{ description: '', amount: '', sign: '+' }]);
  const [notes, setNotes] = useState<string>('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  
  // Workflow states
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [editingTxNo, setEditingTxNo] = useState<string>('');
  const [refreshCount, setRefreshCount] = useState<number>(0);
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState('');

  // Drag and Drop State
  const [dragActive, setDragActive] = useState<boolean>(false);

  // Validation & feedback states
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showToast, setShowToast] = useState<boolean>(false);
  const [successStatus, setSuccessStatus] = useState<'Draft' | 'Pending'>('Pending');
  const [createdTxNo, setCreatedTxNo] = useState<string>('');

  // Handle adding a line item
  const handleAddItem = () => {
    if (items.length >= 10) return;
    setItems([...items, { description: '', amount: '', sign: '+' }]);
  };

  // Handle removing a line item
  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    const newItems = [...items];
    newItems.splice(index, 1);
    setItems(newItems);
  };

  // Handle line item field changes
  const handleItemChange = <K extends keyof ItemInput>(index: number, field: K, value: ItemInput[K]) => {
    const newItems = [...items];
    newItems[index][field] = value;
    setItems(newItems);
    
    // Dynamically clear specific item error if value entered
    if (errors[`desc_${index}`] && field === 'description' && String(value).trim()) {
      const newErrors = { ...errors };
      delete newErrors[`desc_${index}`];
      setErrors(newErrors);
    }
    if (errors[`amt_${index}`] && field === 'amount' && String(value).trim()) {
      const newErrors = { ...errors };
      delete newErrors[`amt_${index}`];
      setErrors(newErrors);
    }
  };

  // Calculate dynamic totals
  const totalAmount = items.reduce((sum, item) => {
    const val = parseFloat(item.amount) || 0;
    const signedVal = item.sign === '-' ? -val : val;
    return sum + signedVal;
  }, 0);

  // Form validation routine
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    let hasErrors = false;

    // Station validation
    if (!stationId) {
      newErrors['station_id'] = isRtl 
        ? '⚠️ يجب اختيار الفرع/المحطة أولاً ولا يمكن إضافة حركة بدون فرع.' 
        : '⚠️ A station must be selected. Creating transaction without a station is not allowed.';
      hasErrors = true;
    }

    // Date validation
    if (!date) {
      newErrors['date'] = isRtl ? 'تاريخ المعاملة مطلوب.' : 'Transaction date is required.';
      hasErrors = true;
    } else {
      const selectedDate = new Date(date);
      const today = new Date();
      const maxFutureDate = new Date();
      maxFutureDate.setDate(today.getDate() + 30); // Allow max 30 days in future for post-dated
      
      if (selectedDate > maxFutureDate) {
        newErrors['date'] = isRtl 
          ? 'تاريخ الحركة لا يمكن أن يكون في المستقبل البعيد (الحد الأقصى 30 يوماً).' 
          : 'Transaction date cannot be in the far future (max 30 days).';
        hasErrors = true;
      }
    }

    // Line items validation
    items.forEach((item, idx) => {
      if (!item.description.trim()) {
        newErrors[`desc_${idx}`] = isRtl ? 'البيان / الوصف مطلوب لهذا البند.' : 'Description is required.';
        hasErrors = true;
      } else if (item.description.trim().length < 3) {
        newErrors[`desc_${idx}`] = isRtl ? 'يجب أن يكون البيان 3 أحرف على الأقل.' : 'Description must be at least 3 characters.';
        hasErrors = true;
      }

      if (!item.amount) {
        newErrors[`amt_${idx}`] = isRtl ? 'المبلغ مطلوب لهذا البند.' : 'Amount is required.';
        hasErrors = true;
      } else {
        const num = parseFloat(item.amount);
        if (isNaN(num) || num <= 0) {
          newErrors[`amt_${idx}`] = isRtl ? 'يجب أن يكون المبلغ أكبر من الصفر.' : 'Amount must be greater than zero.';
          hasErrors = true;
        }
      }
    });

    // Net total validation
    if (totalAmount <= 0) {
      newErrors['total_amount'] = isRtl
        ? 'يجب أن يكون صافي إجمالي المصروف أكبر من الصفر لتقديمه.'
        : 'Net total expense amount must be greater than zero.';
      hasErrors = true;
    }

    // Attachments validation (max 5)
    if (attachments.length > 5) {
      newErrors['attachments'] = isRtl 
        ? 'الحد الأقصى المسموح به هو 5 مرفقات فقط.' 
        : 'Maximum allowed is 5 attachments.';
      hasErrors = true;
    }

    setErrors(newErrors);
    return !hasErrors;
  };

  // Drag over dropzone
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  // Drop files into dropzone
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  // Process selected file lists
  const processFiles = (fileList: FileList) => {
    const newErrors = { ...errors };
    delete newErrors['attachments'];
    
    // Check if adding files exceeds max 5 count limit
    if (attachments.length + fileList.length > 5) {
      newErrors['attachments'] = isRtl 
        ? 'لا يمكنك رفع أكثر من 5 مرفقات في الحركة الواحدة.' 
        : 'You cannot upload more than 5 attachments per transaction.';
      setErrors(newErrors);
      return;
    }

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      
      // Limit size to 700KB (Firestore 1MB document limit considering base64 overhead)
      if (file.size > 700 * 1024) {
        newErrors['attachments'] = isRtl 
          ? `الملف "${file.name}" يتجاوز الحد الأقصى المسموح به (700 كيلوبايت).` 
          : `File "${file.name}" exceeds the maximum limit of 700KB.`;
        continue;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          const base64Url = event.target.result as string;
          const newAttachment: Attachment = {
            id: `att-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            name: file.name,
            size: file.size,
            type: file.type || 'application/octet-stream',
            url: base64Url,
            uploaded_at: new Date().toISOString()
          };
          setAttachments(prev => [...prev, newAttachment]);
        }
      };
      reader.readAsDataURL(file);
    }
    
    setErrors(newErrors);
  };

  // Manual file upload handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
  };

  // Discard single uploaded attachment
  const handleRemoveAttachment = (attId: string) => {
    setAttachments(prev => prev.filter(a => a.id !== attId));
  };

  // Submit form with explicit status target
  const handleSubmit = async (e: React.FormEvent, targetStatus: 'Draft' | 'Pending') => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      // Map items to sub-items structure
      const parsedItems = items.map(it => {
        const val = parseFloat(it.amount) || 0;
        const signedVal = it.sign === '-' ? -val : val;
        return {
          description: it.description.trim(),
          amount: signedVal
        };
      });

      // Combined descriptions for lists
      const combinedDescription = parsedItems.map(it => {
        const prefix = it.amount < 0 ? '(-)' : '';
        return `${prefix}${it.description}`;
      }).join(' / ');
      
      if (editingTxId) {
        // Update existing transaction
        const res = await CustodyDB.updateTransaction(editingTxId, {
          date,
          station_id: stationId,
          description: combinedDescription,
          amount: totalAmount,
          category_id: categoryId,
          items: parsedItems,
          amount_in_words: {
            ar: getArabicTafqeet(totalAmount),
            en: getEnglishTafqeet(totalAmount)
          },
          notes: notes.trim() || undefined,
          status: targetStatus,
          attachments: attachments
        });
        
        if (!res.success) {
          setErrors({ submit: res.errors?.join(' \n ') || 'Failed to update transaction' });
          setIsSubmitting(false);
          return;
        }
        
        setCreatedTxNo(editingTxNo || 'TX-Updated');
        setEditingTxId(null);
        setEditingTxNo('');
      } else {
        // Add transaction via CustodyDB manager
        const res = await CustodyDB.addTransaction({
          date,
          station_id: stationId,
          description: combinedDescription,
          amount: totalAmount,
          category_id: categoryId,
          items: parsedItems,
          amount_in_words: {
            ar: getArabicTafqeet(totalAmount),
            en: getEnglishTafqeet(totalAmount)
          },
          notes: notes.trim() || undefined,
          status: targetStatus,
          attachments: attachments
        });
        
        if (!res.success) {
          setErrors({ submit: res.errors?.join(' \n ') || 'Failed to create transaction' });
          setIsSubmitting(false);
          return;
        }
        
        setCreatedTxNo(res.data?.transaction_no || 'TX-Created');
      }

      // Reset Form
      setItems([{ description: '', amount: '', sign: '+' }]);
      setNotes('');
      setAttachments([]);
      if (!(activeUser?.role === 'StationAdmin' && activeUser?.station_id)) {
        setStationId(activeUser?.station_id || (scopedStations.length > 0 ? scopedStations[0].id : ''));
      }
      setSuccessStatus(targetStatus);
      setShowToast(true);

      // Auto scroll to top of page to see toast and feedback
      window.scrollTo({ top: 0, behavior: 'smooth' });

      // Auto hide toast after 5 seconds
      setTimeout(() => {
        setShowToast(false);
      }, 5000);
    } catch (err: any) {
      console.error('Submission failed:', err);
      setErrors({ submit: err.message || 'An unexpected error occurred.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Load Saved Drafts for this station/user scoped environment
  const drafts = CustodyDB.getScopedTransactions().filter(t => t.status === 'Draft');

  // Load saved draft into active form inputs
  const handleEditDraft = (tx: Transaction) => {
    setEditingTxId(tx.id);
    setEditingTxNo(tx.transaction_no);
    setStationId(tx.station_id || '');
    setDate(tx.date);
    setCategoryId(tx.category_id || 'cat-6');
    setNotes(tx.notes || '');
    if (tx.items && tx.items.length > 0) {
      setItems(tx.items.map(it => ({
        description: it.description,
        amount: Math.abs(it.amount).toString(),
        sign: it.amount < 0 ? '-' as const : '+' as const
      })));
    } else {
      setItems([{
        description: tx.description,
        amount: Math.abs(tx.amount).toString(),
        sign: tx.amount < 0 ? '-' as const : '+' as const
      }]);
    }
    setAttachments(tx.attachments || []);
    setErrors({});
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Permanent Delete Draft
  const handleDeleteDraft = async (id: string) => {
    if (!deleteReason.trim()) {
      alert(isRtl ? 'يجب إدخال سبب الحذف الإجباري!' : 'Mandatory deletion reason is required!');
      return;
    }
    const success = await CustodyDB.deleteTransaction(id, deleteReason);
    if (success) {
      if (editingTxId === id) {
        handleCancelEdit();
      }
      setRefreshCount(prev => prev + 1);
      setDeletingDraftId(null);
      setDeleteReason('');
    }
  };

  // Revert back to fresh creation state
  const handleCancelEdit = () => {
    setEditingTxId(null);
    setEditingTxNo('');
    setDate(new Date().toISOString().split('T')[0]);
    setCategoryId('cat-6');
    setItems([{ description: '', amount: '', sign: '+' }]);
    setNotes('');
    setAttachments([]);
    setErrors({});
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div>
        <h2 className="text-xl font-black tracking-tight md:text-2xl flex items-center gap-2">
          <PlusCircle className="text-emerald-500" />
          <span>{t.newExpense}</span>
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          {isRtl 
            ? 'إنشاء مصروفات وتدقيقها بشكل كامل مع خيار الحفظ كمسودة (Draft) أو التسجيل كطلب معلق (Pending)، وتثبيت الوثائق والمرفقات الداعمة.' 
            : 'Register expenses with options to save as Draft or submit as Pending, accompanied by robust validation and document attachments.'
          }
        </p>
      </div>

      {/* Success Toast */}
      {showToast && (
        <div className="p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-sm flex items-center gap-3 shadow-md animate-fade-in">
          <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
          <div className="flex-1">
            <span className="font-bold">
              {successStatus === 'Draft' 
                ? (isRtl ? 'تم حفظ المسودة بنجاح!' : 'Draft saved successfully!')
                : (isRtl ? 'تم تقديم الطلب بنجاح (حالة معلقة)!' : 'Submitted successfully with Pending status!')
              }
            </span>
            <div className="text-xs opacity-90 mt-0.5">
              {isRtl 
                ? `رقم التسلسل المالي الصادر تلقائياً: ${createdTxNo}` 
                : `Generated Sequence Number: ${createdTxNo}`
              }
            </div>
          </div>
          <button 
            onClick={() => onNavigate(successStatus === 'Draft' ? 'new-expense' : 'pending')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 border-none shrink-0 ${
              isRtl ? 'mr-auto' : 'ml-auto'
            }`}
          >
            {successStatus === 'Draft' 
              ? (isRtl ? 'إغلاق' : 'Close') 
              : (isRtl ? 'عرض المصاريف المعلقة' : 'View Pending')
            }
          </button>
        </div>
      )}

      {/* Editing State Banner */}
      {editingTxId && (
        <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/25 text-blue-700 dark:text-blue-400 text-xs md:text-sm flex flex-wrap justify-between items-center gap-3">
          <div className="flex items-center gap-2">
            <PenSquare className="h-4 w-4 text-blue-500 animate-bounce" />
            <span>
              {isRtl 
                ? `تعديل المسودة النشطة رقم: ${editingTxNo}` 
                : `Currently updating Draft Sequence: ${editingTxNo}`
              }
            </span>
          </div>
          <button 
            type="button"
            onClick={handleCancelEdit}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-500/20 text-blue-600 dark:text-blue-300 text-xs font-bold hover:bg-blue-500/30 border-none"
          >
            <X size={12} />
            <span>{isRtl ? 'إلغاء وتعديل حركة جديدة' : 'Cancel Edit & New'}</span>
          </button>
        </div>
      )}

      {/* Bento Layout Grid */}
      <div className="grid gap-6 lg:grid-cols-3 items-start">
        {/* Left main form section (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          <div id="new-expense-form-title" className={`p-6 rounded-2xl border ${
            theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200 shadow-sm'
          }`}>
            <form className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-3">
                {/* Station Selection */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <Coins size={14} className="text-slate-400" />
                    <span>{isRtl ? 'الفرع / المحطة *' : 'Station / Branch *'}</span>
                  </label>
                  <select
                    value={stationId}
                    disabled={activeUser?.role === 'StationAdmin' && !!activeUser?.station_id}
                    onChange={(e) => {
                      setStationId(e.target.value);
                      if (errors['station_id']) {
                        const newErrors = { ...errors };
                        delete newErrors['station_id'];
                        setErrors(newErrors);
                      }
                    }}
                    className={`w-full px-4 py-2.5 rounded-xl border text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors ${
                      theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
                    } ${errors['station_id'] ? 'border-rose-500 ring-1 ring-rose-500/10' : ''} ${
                      activeUser?.role === 'StationAdmin' && !!activeUser?.station_id ? 'opacity-70 cursor-not-allowed' : ''
                    }`}
                    required
                  >
                    <option value="">{isRtl ? '-- اختر الفرع --' : '-- Select Station --'}</option>
                    {scopedStations.map(st => (
                      <option key={st.id} value={st.id}>
                        {st.station_name}
                      </option>
                    ))}
                  </select>
                  {errors['station_id'] && (
                    <span className="text-rose-500 text-[10px] mt-1 block font-bold">{errors['station_id']}</span>
                  )}
                </div>

                {/* Date Input */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <Calendar size={14} className="text-slate-400" />
                    <span>{t.date} *</span>
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => {
                      setDate(e.target.value);
                      if (errors['date']) {
                        const newErrors = { ...errors };
                        delete newErrors['date'];
                        setErrors(newErrors);
                      }
                    }}
                    className={`w-full px-4 py-2.5 rounded-xl border text-sm font-semibold font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors ${
                      theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
                    } ${errors['date'] ? 'border-rose-500 ring-1 ring-rose-500/10' : ''}`}
                    required
                  />
                  {errors['date'] && (
                    <span className="text-rose-500 text-[10px] mt-1 block font-bold">{errors['date']}</span>
                  )}
                </div>

                {/* Category Input */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <Tag size={14} className="text-slate-400" />
                    <span>{isRtl ? 'تصنيف المصروف *' : 'Expense Category *'}</span>
                  </label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className={`w-full px-4 py-2.5 rounded-xl border text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors ${
                      theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
                    }`}
                    required
                  >
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {isRtl ? cat.name_ar : cat.name_en}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Items Section */}
              <div className="space-y-4">
                <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    {isRtl ? 'البنود والبيانات المصاحبة (حتى 10 بنود)' : 'Line Items & Details (Up to 10 items)'}
                  </span>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    disabled={items.length >= 10}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                      items.length >= 10
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                        : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20'
                    }`}
                  >
                    <Plus size={14} />
                    <span>{isRtl ? 'إضافة بيان ومبلغ' : 'Add Description & Amount'}</span>
                  </button>
                </div>

                <div className="space-y-3.5">
                  {items.map((item, idx) => (
                    <div 
                      key={idx} 
                      className={`p-4 rounded-xl border relative transition-all ${
                        theme === 'dark' ? 'bg-slate-900/40 border-slate-800' : 'bg-slate-50/40 border-slate-100 shadow-sm'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-mono font-bold bg-slate-200/60 dark:bg-slate-800 px-2.5 py-0.5 rounded-md text-slate-500">
                          {isRtl ? `بند #${idx + 1}` : `Item #${idx + 1}`}
                        </span>
                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="p-1 rounded-lg text-rose-500 hover:bg-rose-500/10 transition-colors"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        {/* Item Description */}
                        <div className="sm:col-span-2">
                          <label className="block text-[10px] font-bold text-slate-400 mb-1 flex items-center gap-1">
                            <FileText size={12} />
                            <span>{isRtl ? 'البيان / الوصف *' : 'Description *'}</span>
                          </label>
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                            placeholder={isRtl ? 'مثال: شراء أحبار ومستلزمات مكتبية' : 'e.g., Ink cartridges and stationery'}
                            className={`w-full px-3 py-2 rounded-lg border text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors ${
                              theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
                            } ${errors[`desc_${idx}`] ? 'border-rose-500 ring-1 ring-rose-500/10' : ''}`}
                          />
                          {errors[`desc_${idx}`] && (
                            <span className="text-rose-500 text-[10px] mt-1 block font-bold">{errors[`desc_${idx}`]}</span>
                          )}
                        </div>

                        {/* Item Amount */}
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 mb-1 flex items-center gap-1">
                            <DollarSign size={12} />
                            <span>{isRtl ? 'المعامل والمبلغ *' : 'Sign & Amount *'}</span>
                          </label>
                          <div className="flex gap-1.5 items-center">
                            {/* Sign Selector */}
                            <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden shrink-0 h-[34px] p-0.5 bg-slate-100 dark:bg-slate-800">
                              <button
                                type="button"
                                onClick={() => handleItemChange(idx, 'sign', '+')}
                                className={`w-7 h-full flex items-center justify-center rounded-md text-[13px] font-black transition-all ${
                                  item.sign === '+' 
                                    ? 'bg-emerald-500 text-white shadow-sm' 
                                    : 'bg-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                                }`}
                              >
                                +
                              </button>
                              <button
                                type="button"
                                onClick={() => handleItemChange(idx, 'sign', '-')}
                                className={`w-7 h-full flex items-center justify-center rounded-md text-[13px] font-black transition-all ${
                                  item.sign === '-' 
                                    ? 'bg-rose-500 text-white shadow-sm' 
                                    : 'bg-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                                }`}
                              >
                                -
                              </button>
                            </div>

                            {/* Numeric Input */}
                            <div className="relative flex-1">
                              <input
                                type="number"
                                step="0.01"
                                value={item.amount}
                                onChange={(e) => handleItemChange(idx, 'amount', e.target.value)}
                                placeholder="0.00"
                                className={`w-full h-[34px] px-3 py-2 rounded-lg border text-xs font-bold font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors ${
                                  theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
                                } ${isRtl ? 'pl-8' : 'pr-8'} ${errors[`amt_${idx}`] ? 'border-rose-500 ring-1 ring-rose-500/10' : ''}`}
                              />
                              <div className={`absolute top-0 bottom-0 flex items-center px-2 text-[10px] font-bold text-slate-400 ${
                                isRtl ? 'left-0 border-r border-slate-200 dark:border-slate-700' : 'right-0 border-l border-slate-200 dark:border-slate-700'
                              }`}>
                                ج.م
                              </div>
                            </div>
                          </div>
                          {errors[`amt_${idx}`] && (
                            <span className="text-rose-500 text-[10px] mt-1 block font-bold">{errors[`amt_${idx}`]}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tafqeet Section */}
              {totalAmount > 0 && (
                <div className={`p-4 rounded-xl border flex flex-col gap-2.5 ${
                  theme === 'dark' ? 'bg-emerald-950/15 border-emerald-500/20' : 'bg-emerald-50/40 border-emerald-500/10'
                }`}>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Coins size={14} className="text-emerald-500" />
                      {isRtl ? 'إجمالي مبلغ المصروف:' : 'Total Expense Amount:'}
                    </span>
                    <span className="text-base font-black text-emerald-600 dark:text-emerald-400 font-mono">
                      {totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP
                    </span>
                  </div>

                  <div className="text-xs space-y-1.5 border-t border-dashed border-slate-200 dark:border-slate-800 pt-2.5">
                    <div className="flex items-start gap-1">
                      <span className="text-slate-400 font-bold shrink-0">{isRtl ? 'التفقيط بالعربية:' : 'Arabic Words:'}</span>
                      <span className="font-extrabold text-slate-800 dark:text-slate-200">{getArabicTafqeet(totalAmount)}</span>
                    </div>
                    <div className="flex items-start gap-1">
                      <span className="text-slate-400 font-bold shrink-0">{isRtl ? 'التفقيط بالإنجليزية:' : 'English Words:'}</span>
                      <span className="font-semibold text-slate-600 dark:text-neutral-400">{getEnglishTafqeet(totalAmount)}</span>
                    </div>
                  </div>
                </div>
              )}

              {errors.total_amount && (
                <div className="p-3.5 rounded-xl border border-rose-200 dark:border-rose-900/30 bg-rose-500/5 text-rose-600 dark:text-rose-400 text-xs font-bold leading-relaxed">
                  {errors.total_amount}
                </div>
              )}

              {/* Attachments Upload with drag-and-drop */}
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Paperclip size={14} className="text-slate-400" />
                    <span>{isRtl ? 'المرفقات والوثائق الداعمة *' : 'Attachments & Documents *'}</span>
                  </span>
                  <span className="text-[10px] text-slate-400 lowercase">({isRtl ? 'اختياري، بحد أقصى 5 ملفات' : 'optional, max 5 files'})</span>
                </label>

                {/* Dropzone Area */}
                <div
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all duration-150 relative ${
                    dragActive 
                      ? 'border-emerald-500 bg-emerald-500/5' 
                      : theme === 'dark' 
                        ? 'border-slate-700 bg-slate-800/20 hover:bg-slate-800/45 hover:border-slate-600' 
                        : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-300'
                  } ${errors['attachments'] ? 'border-rose-500 bg-rose-500/5' : ''}`}
                >
                  <label className="cursor-pointer block">
                    <input
                      type="file"
                      multiple
                      onChange={handleFileChange}
                      accept="image/*,.pdf,.xls,.xlsx,.doc,.docx"
                      className="hidden"
                    />
                    <div className="flex flex-col items-center justify-center gap-2">
                      <UploadCloud className={`h-8 w-8 ${dragActive ? 'text-emerald-500 animate-bounce' : 'text-slate-400'}`} />
                      <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        {isRtl 
                          ? 'اسحب الملفات وأفلتها هنا أو اضغط للتصفح' 
                          : 'Drag and drop files here or click to browse'
                        }
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {isRtl 
                          ? 'الحد الأقصى للملف: 700 كيلوبايت (الصور، PDF، Excel، Word)' 
                          : 'Maximum file size: 700KB (Images, PDF, Excel, Word)'
                        }
                      </div>
                    </div>
                  </label>
                </div>

                {errors['attachments'] && (
                  <span className="text-rose-500 text-[10px] mt-1 block font-bold">{errors['attachments']}</span>
                )}

                {/* Attached Files List */}
                {attachments.length > 0 && (
                  <div className="mt-3.5 space-y-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      {isRtl ? 'الملفات المرفقة حالياً:' : 'Uploaded Files:'}
                    </span>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {attachments.map((file) => (
                        <div 
                          key={file.id}
                          className={`p-2.5 rounded-lg border text-xs flex items-center justify-between gap-2.5 transition-all ${
                            theme === 'dark' ? 'bg-slate-800/40 border-slate-700' : 'bg-slate-50 border-slate-100'
                          }`}
                        >
                          <div className="flex items-center gap-2 overflow-hidden flex-1">
                            <FileIcon size={14} className="text-emerald-500 shrink-0" />
                            <a 
                              href={file.url} 
                              download={file.name} 
                              title={isRtl ? 'انقر لتنزيل الملف' : 'Click to download file'}
                              className="font-medium text-slate-700 dark:text-slate-300 truncate hover:underline hover:text-emerald-500 dark:hover:text-emerald-400 cursor-pointer"
                            >
                              {file.name}
                            </a>
                            <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                              ({formatFileSize(file.size)})
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveAttachment(file.id)}
                            className="text-slate-400 hover:text-rose-500 p-1 rounded transition-colors"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Notes Input */}
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                  {t.notes} <span className="text-[10px] text-slate-400 lowercase">({isRtl ? 'اختياري' : 'optional'})</span>
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={isRtl ? 'ملاحظات تدقيقية للقسم المالي...' : 'Internal notes or approval references...'}
                  className={`w-full px-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors ${
                    theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-800'
                  }`}
                />
              </div>

              {/* Validation/Submission Error Alert */}
              {errors.submit && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-xs font-semibold dark:bg-rose-950/20 dark:border-rose-900/30 dark:text-rose-400 whitespace-pre-line">
                  {errors.submit}
                </div>
              )}

              {/* Dynamic Action Buttons for Draft & Submit */}
              <div className="grid gap-3 sm:grid-cols-2 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                {/* Save as Draft */}
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={(e) => handleSubmit(e, 'Draft')}
                  className={`flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all border ${
                    isSubmitting ? 'opacity-50 cursor-not-allowed' : ''
                  } ${
                    theme === 'dark' 
                      ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700' 
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  <Save size={16} />
                  <span>{isSubmitting ? (isRtl ? 'جاري الحفظ...' : 'Saving...') : (isRtl ? 'حفظ كمسودة (Draft)' : 'Save as Draft')}</span>
                </button>

                {/* Submit as Pending */}
                <button
                  id="btn-submit-expense"
                  type="button"
                  disabled={isSubmitting}
                  onClick={(e) => handleSubmit(e, 'Pending')}
                  className={`flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all shadow-md shadow-emerald-600/10 hover:shadow-lg hover:scale-[1.01] ${
                    isSubmitting ? 'opacity-50 cursor-not-allowed bg-emerald-700' : ''
                  }`}
                >
                  <FilePlus2 size={16} />
                  <span>{isSubmitting ? (isRtl ? 'جاري التقديم...' : 'Submitting...') : (isRtl ? 'تقديم كطلب معلق (Pending)' : 'Submit as Pending')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right side drafts sidebar panel (1 col) */}
        <div className="lg:col-span-1 space-y-6">
          <div className={`p-5 rounded-2xl border ${
            theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200 shadow-sm'
          }`}>
            <div className="flex items-center gap-2 pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
              <PenSquare className="text-amber-500 h-4.5 w-4.5" />
              <h3 className="font-bold text-xs md:text-sm text-slate-800 dark:text-slate-100">
                {isRtl ? 'المسودات المحفوظة محلياً' : 'Local Saved Drafts'}
              </h3>
              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/10 text-amber-500 font-mono mr-auto">
                {drafts.length}
              </span>
            </div>

            {drafts.length === 0 ? (
              <div className="py-8 text-center text-slate-400 dark:text-slate-500">
                <HelpCircle className="h-7 w-7 mx-auto stroke-1 opacity-60 mb-2" />
                <p className="text-xs">
                  {isRtl ? 'لا توجد أي مسودات محفوظة حالياً.' : 'No drafts saved yet.'}
                </p>
                <p className="text-[10px] opacity-80 mt-1 max-w-[200px] mx-auto leading-relaxed">
                  {isRtl ? 'يمكنك تحضير الحركة وحفظها كمسودة لإكمالها لاحقاً.' : 'Prepare details and click "Save as Draft" to keep them here.'}
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
                {drafts.map((draft) => {
                  const isCurrent = editingTxId === draft.id;
                  return (
                    <div 
                      key={draft.id}
                      className={`p-3 rounded-xl border transition-all ${
                        isCurrent 
                          ? 'border-blue-500 bg-blue-500/5 ring-1 ring-blue-500/20 shadow-sm' 
                          : theme === 'dark' 
                            ? 'bg-slate-900/40 border-slate-800/80 hover:border-slate-700' 
                            : 'bg-slate-50/50 border-slate-100 hover:bg-slate-50 hover:border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-bold font-mono text-[11px] text-slate-700 dark:text-slate-300">
                          {draft.transaction_no}
                        </span>
                        <span className="text-[9px] text-slate-400 font-mono">
                          {draft.date}
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed mb-2.5">
                        {draft.description}
                      </p>

                      <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800/80 pt-2 text-[10px]">
                        <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400">
                          {draft.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م
                        </span>

                        <div className="flex items-center gap-1">
                          {/* Edit button */}
                          <button
                            type="button"
                            onClick={() => handleEditDraft(draft)}
                            title={isRtl ? 'تعديل وتحميل في النموذج' : 'Load draft into form'}
                            className={`px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 transition-colors ${
                              isCurrent 
                                ? 'bg-blue-500 text-white' 
                                : 'bg-slate-200/50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-emerald-500 hover:text-white'
                            }`}
                          >
                            <PenSquare size={10} />
                            <span>{isRtl ? 'تعديل' : 'Edit'}</span>
                          </button>

                          {/* Delete button */}
                          <button
                            type="button"
                            onClick={() => setDeletingDraftId(draft.id)}
                            title={isRtl ? 'حذف المسودة نهائياً' : 'Delete draft permanently'}
                            className="p-1 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* DELETE CONFIRMATION DIALOG */}
      {deletingDraftId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className={`w-full max-w-sm p-5 rounded-2xl border shadow-xl ${
            theme === 'dark' ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center gap-3 text-rose-500 mb-3">
              <Trash2 className="h-6 w-6 shrink-0" />
              <h3 className="font-bold text-base">{isRtl ? 'تأكيد الحذف النهائي' : 'Confirm Permanent Delete'}</h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-3">
              {isRtl 
                ? 'هل أنت متأكد من رغبتك في حذف هذه المسودة نهائياً؟ لا يمكن التراجع عن هذا الإجراء.'
                : 'Are you sure you want to permanently delete this draft? This action cannot be undone.'}
            </p>
            <div className="mb-4">
              <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                {isRtl ? 'سبب الحذف (إجباري) *' : 'Reason for Deletion (Mandatory) *'}
              </label>
              <textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder={isRtl ? 'أدخل سبب مقنع للحذف...' : 'Enter a valid reason for deletion...'}
                className="w-full p-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-rose-500 resize-none h-16"
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDeletingDraftId(null);
                  setDeleteReason('');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-slate-100 ${theme === 'dark' ? 'hover:bg-slate-800' : ''}`}
              >
                {isRtl ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => handleDeleteDraft(deletingDraftId)}
                disabled={!deleteReason.trim()}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-500 hover:bg-rose-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isRtl ? 'حذف نهائي' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
