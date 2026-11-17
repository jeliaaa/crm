'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

// Calls land via webhook, so the count has to come to us — refresh on
// navigation and every half minute. Shared by the desktop sidebar and the
// mobile nav so both badges agree.
export function useActionCount() {
  const pathname = usePathname();
  const [actionCount, setActionCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/action-required', { cache: 'no-store' });
      if (!res.ok) return;
      const { count } = await res.json();
      setActionCount(typeof count === 'number' ? count : 0);
    } catch { /* offline — leave the last known count */ }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 30_000);
    return () => clearInterval(timer);
  }, [refresh, pathname]);

  return actionCount;
}
