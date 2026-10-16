export type AnalyticsContext = { page: 'home' | 'lab'; mode?: string; lab_id?: string; reference_id?: string; challenge_id?: string };
export type AnalyticsEvent = 'screen_view' | 'mode_opened' | 'lab_opened' | 'reference_opened' | 'configuration_checked' | 'simulation_run' | 'challenge_opened' | 'challenge_evaluated' | 'diagram_saved' | 'active_time';
type Properties = AnalyticsContext & { format?: string; success?: boolean; passed?: boolean; seconds?: number };
type TrackerWindow = Window & { labAnalyticsBeforeSend?: (type: string, payload: unknown) => unknown; umami?: { track: (event: string, properties: Record<string, string | number | boolean>) => unknown } };
let enabled = false;
let context: AnalyticsContext = { page: 'home' };
let pending: { event: AnalyticsEvent; properties: Properties }[] = [];
const MODES = new Set(['design', 'simulate', 'failure', 'analyze', 'compare', 'challenges']);

export function safeProperties(properties: Properties): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = { page: properties.page === 'lab' ? 'lab' : 'home' };
  if (properties.mode && MODES.has(properties.mode)) result.mode = properties.mode;
  for (const key of ['lab_id', 'reference_id', 'challenge_id'] as const) {
    const value = properties[key];
    if (value && /^[a-z0-9-]{1,100}$/.test(value)) result[key] = value;
  }
  if (['draft', 'reference', 'lab'].includes(properties.format ?? '')) result.format = properties.format!;
  if (typeof properties.success === 'boolean') result.success = properties.success;
  if (typeof properties.passed === 'boolean') result.passed = properties.passed;
  if (Number.isFinite(properties.seconds) && properties.seconds! > 0) result.seconds = Math.round(properties.seconds! * 10) / 10;
  return result;
}
function optedOut(): boolean {
  try { return navigator.doNotTrack === '1' || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true || localStorage.getItem('umami.disabled') === '1'; }
  catch { return true; }
}
function deliver(event: AnalyticsEvent, properties: Properties) {
  try {
    const result = (window as TrackerWindow).umami?.track(event, safeProperties(properties));
    if (result && typeof (result as Promise<unknown>).catch === 'function') void (result as Promise<unknown>).catch(() => {});
  } catch { /* Analytics must never break the lab. */ }
}
export function track(event: AnalyticsEvent, properties: Partial<Properties> = {}) {
  if (!enabled || optedOut()) return;
  const data = { ...context, ...properties };
  if (!(window as TrackerWindow).umami) {
    if (pending.length < 50) pending.push({ event, properties: data });
    return;
  }
  deliver(event, data);
}
export function setAnalyticsContext(next: Partial<AnalyticsContext>) {
  context = { ...context, ...next };
}

/** Visible, recently interacting time; never counts an unattended background tab. */
export class ActiveTime {
  private previous: number;
  private interaction: number;
  private total = 0;
  private idleMs: number;
  constructor(now: number, idleMs = 60_000) { this.previous = now; this.interaction = now; this.idleMs = idleMs; }
  sample(now: number, visible: boolean) {
    if (visible) this.total += Math.max(0, Math.min(now, this.interaction + this.idleMs) - this.previous);
    this.previous = now;
  }
  interact(now: number, visible: boolean) { this.sample(now, visible); this.interaction = now; }
  drain(): number { const seconds = this.total / 1000; this.total = 0; return seconds; }
}

export function initializeAnalytics(config: { production: boolean; websiteId?: string; scriptUrl?: string; domains?: string }): () => void {
  if (enabled || !config.production || !config.websiteId || !config.scriptUrl || !config.domains || optedOut()) return () => {};
  const domains = config.domains.split(',').map(domain => domain.trim()).filter(Boolean);
  if (!domains.includes(window.location.hostname)) return () => {};
  try { if (new URL(config.scriptUrl).protocol !== 'https:') return () => {}; } catch { return () => {}; }
  enabled = true;
  const script = document.createElement('script');
  script.async = true;
  script.src = config.scriptUrl;
  script.dataset.websiteId = config.websiteId;
  script.dataset.domains = domains.join(',');
  // Apply our opt-out to native pageviews as well as custom events.
  (window as TrackerWindow).labAnalyticsBeforeSend = (_type, payload) => enabled && !optedOut() ? payload : false;
  script.dataset.beforeSend = 'labAnalyticsBeforeSend';
  script.dataset.doNotTrack = 'true';
  script.dataset.excludeSearch = 'true';
  script.dataset.excludeHash = 'true';
  script.onload = () => { const queued = pending; pending = []; if (!optedOut()) queued.forEach(item => deliver(item.event, item.properties)); };
  script.onerror = () => { pending = []; enabled = false; };
  document.head.appendChild(script);
  const clock = new ActiveTime(performance.now());
  let visible = document.visibilityState === 'visible';
  const interact = () => clock.interact(performance.now(), visible);
  const flush = () => {
    clock.sample(performance.now(), visible);
    const seconds = clock.drain();
    if (seconds > 0) track('active_time', { seconds });
  };
  const visibility = () => { flush(); visible = document.visibilityState === 'visible'; };
  // Flush the previous screen/context before attributing time to a different lab.
  window.addEventListener('analytics-context-change', flush);
  const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;
  events.forEach(event => window.addEventListener(event, interact, { passive: true }));
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('pagehide', flush);
  const timer = window.setInterval(flush, 30_000);
  return () => {
    flush(); enabled = false; pending = [];
    window.clearInterval(timer);
    events.forEach(event => window.removeEventListener(event, interact));
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('pagehide', flush);
    window.removeEventListener('analytics-context-change', flush);
    script.remove();
  };
}
export function changeAnalyticsContext(next: Partial<AnalyticsContext>) {
  if (enabled) window.dispatchEvent(new Event('analytics-context-change'));
  setAnalyticsContext(next);
}

export function analyticsEnabled(): boolean { return enabled; }
export function disableAnalytics(): void {
  try { localStorage.setItem('umami.disabled', '1'); } catch { /* Still stop our event tracking. */ }
  enabled = false;
  pending = [];
}
