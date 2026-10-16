import React, { useEffect, useState } from 'react';
import { useArchitecture } from '../../context/ArchitectureContext.tsx';
import { CURRENT_RELEASE, isNewRelease, saveUpdateRecovery, UPDATE_RECOVERY_KEY, type Release } from '../../engine/releases/release.ts';

export function ReleaseStatus() {
  const { exportDraft, importDraft } = useArchitecture();
  const [available, setAvailable] = useState<Release | null>(null);
  const [error, setError] = useState('');
  const [recovery, setRecovery] = useState(false);
  useEffect(() => {
    try { setRecovery(!!sessionStorage.getItem(UPDATE_RECOVERY_KEY)); } catch { /* Storage may be disabled. */ }
    const controller = new AbortController();
    const check = async () => {
      try {
        const response = await fetch(`${import.meta.env?.BASE_URL ?? '/'}release.json`, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) return;
        const release = await response.json();
        setAvailable(isNewRelease(release) ? release : null);
      } catch { /* Offline or invalid manifest: preserve the current workspace. */ }
    };
    void check();
    const interval = window.setInterval(check, 60_000);
    window.addEventListener('focus', check);
    return () => { controller.abort(); window.clearInterval(interval); window.removeEventListener('focus', check); };
  }, []);
  return <div className="max-w-72">
    <span title={`Built ${CURRENT_RELEASE.builtAt}; build ${CURRENT_RELEASE.buildId}`}>
      {CURRENT_RELEASE.channel} · v{CURRENT_RELEASE.version} · {CURRENT_RELEASE.buildId.slice(0, 8)}
    </span>
    {available && <button className="block text-amber-200 underline" onClick={() => {
      try { saveUpdateRecovery(sessionStorage, exportDraft()); window.location.reload(); }
      catch (e) { setError(e instanceof Error ? e.message : 'Saving failed; reload cancelled.'); }
    }}>Update available—save and reload</button>}
    {recovery && <button className="block text-amber-200 underline" onClick={() => {
      try {
        const text = sessionStorage.getItem(UPDATE_RECOVERY_KEY);
        if (!text) throw new Error('Recovery draft is missing.');
        if (!window.confirm('Restore the work saved before updating? This replaces the current canvas.')) return;
        importDraft(text); sessionStorage.removeItem(UPDATE_RECOVERY_KEY); setRecovery(false);
      } catch (e) { setError(e instanceof Error ? e.message : 'Restore failed.'); }
    }}>Restore work saved before update</button>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
