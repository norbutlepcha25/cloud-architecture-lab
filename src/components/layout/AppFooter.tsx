import { AnalyticsNotice } from '../../analytics/AnalyticsNotice.tsx';
import React from 'react';
import { ReleaseStatus } from './ReleaseStatus.tsx';

export function AppFooter() {
  return (
    <footer className="shrink-0 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-[rgba(255,255,255,0.1)] bg-[#12181F] px-4 py-1 text-[11px] text-white/45">
      <ReleaseStatus />
      <div className="flex flex-wrap items-center gap-x-3">
        <AnalyticsNotice />
        <span title="Cloud Architecture Lab is an independent educational project. AWS and related marks are trademarks of Amazon.com, Inc. or its affiliates.">Not affiliated with AWS</span>
        <span>© {new Date().getFullYear()} cs-Sensei · MIT</span>
        <a
          href="https://github.com/norbutlepcha25/cloud-architecture-lab"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded text-white/60 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-400"
          aria-label="GitHub repository — opens in a new tab"
        >
          GitHub
        </a>
      </div>
    </footer>
  );
}
