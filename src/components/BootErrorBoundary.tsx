import React from 'react';

type Props = { children: React.ReactNode };
type State = { error: Error | null };

export default class BootErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: 'sans-serif', direction: 'rtl' }}>
          <h1>خطأ في تحميل الواجهة</h1>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#b91c1c' }}>
            {this.state.error.message}
          </pre>
          <button type="button" onClick={() => window.location.reload()}>
            إعادة التحميل
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
