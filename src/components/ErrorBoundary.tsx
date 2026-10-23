import * as React from 'react';
import { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in App:', error, errorInfo);
    this.setState({
      error,
      errorInfo
    });
  }

  private handleReset = () => {
    localStorage.clear();
    sessionStorage.clear();
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      const isRtl = true; // Default to Arabic context for KEMIT ERP

      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-900 p-6 font-sans antialiased text-slate-100 selection:bg-rose-500/30 selection:text-rose-200">
          <div className="max-w-2xl w-full bg-slate-800 border border-slate-700/50 rounded-2xl shadow-2xl p-8 space-y-6">
            <div className="flex items-center space-x-4 space-x-reverse">
              <div className="w-12 h-12 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-500 border border-rose-500/20 shrink-0">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="text-right">
                <h1 className="text-xl font-bold tracking-tight text-slate-100">حدث خطأ غير متوقع في النظام</h1>
                <p className="text-sm text-slate-400">An unexpected system error occurred</p>
              </div>
            </div>

            <div className="space-y-4 text-right text-sm leading-relaxed border-t border-b border-slate-700/30 py-5">
              <p className="text-slate-300 font-medium">
                تم رصد استثناء برمجى مفاجئ منع تحميل الواجهة. يمكنك محاولة إعادة تشغيل النظام أو تهيئة الذاكرة المؤقتة لحل المشكلة.
              </p>
              <p className="text-slate-400 ltr text-left font-mono text-xs bg-slate-950/80 p-4 rounded-xl border border-slate-800 max-h-48 overflow-y-auto whitespace-pre-wrap select-all">
                {this.state.error && this.state.error.toString()}
                {this.state.errorInfo && this.state.errorInfo.componentStack}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 sm:justify-start">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-emerald-50 font-semibold rounded-xl text-xs transition-colors flex items-center justify-center"
              >
                إعادة المحاولة / Retry
              </button>
              <button
                type="button"
                onClick={this.handleReset}
                className="px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold rounded-xl text-xs transition-colors"
                title="سيقوم هذا بمسح الذاكرة المحلية والبدء من جديد"
              >
                مسح الجلسة وإعادة التهيئة / Reset Session & Cache
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
