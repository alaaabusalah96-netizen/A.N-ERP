import React, { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';

interface OfflineSyncIndicatorProps {
  language: 'ar' | 'en';
}

export const OfflineSyncIndicator: React.FC<OfflineSyncIndicatorProps> = ({ language }) => {
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);

  const isRtl = language === 'ar';

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) {
    return null;
  }

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className="w-full bg-red-500/10 border-b border-red-500/20 px-4 py-2 text-xs text-red-700 dark:text-red-300 flex items-center justify-between transition-all"
    >
      <div className="flex items-center gap-2">
        <WifiOff size={15} className="text-red-600 dark:text-red-400 animate-pulse shrink-0" />
        <span className="font-medium">
          {isRtl
            ? 'لا يوجد اتصال بالإنترنت. عمليات الحفظ والتعديل متوقفة مؤقتاً لحين إعادة الاتصال.'
            : 'No internet connection. Saves and modifications are disabled until reconnected.'}
        </span>
      </div>
    </div>
  );
};
