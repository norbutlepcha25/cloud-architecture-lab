import React, { useState } from 'react';
import { analyticsEnabled, disableAnalytics } from './analytics.ts';

export function AnalyticsNotice() {
  const [shown] = useState(analyticsEnabled);
  const [disabled, setDisabled] = useState(false);
  if (!shown) return null;
  return <span className="text-xs">
    {disabled ? 'Usage analytics disabled on this browser' : <>
      Usage analytics · <button className="underline" title="Stops usage tracking on this browser. Diagram contents are never sent to analytics." onClick={() => { disableAnalytics(); setDisabled(true); }}>Stop tracking</button>
    </>}
  </span>;
}
