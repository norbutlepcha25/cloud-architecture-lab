import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { ActiveTime, initializeAnalytics, track, changeAnalyticsContext, safeProperties } from '../src/analytics/analytics.ts';

test('Active time stops at idle cutoff, excludes hidden time, resumes on interaction and drains once', () => {
  const clock = new ActiveTime(0);
  clock.sample(30_000, true);
  assert.equal(clock.drain(), 30);
  clock.sample(120_000, true);
  assert.equal(clock.drain(), 30);
  clock.sample(180_000, false);
  clock.interact(180_000, true);
  clock.sample(190_000, true);
  assert.equal(clock.drain(), 10);
  assert.equal(clock.drain(), 0);
});

test('Analytics properties never forward arbitrary configuration or labels', () => {
  const data = safeProperties({ page: 'lab', mode: 'design', lab_id: 'lab3-two-tier', seconds: 12.345, diagram: { password: 'secret' }, name: 'Student name', format: 'lab' } as any);
  assert.deepEqual(data, { page: 'lab', mode: 'design', lab_id: 'lab3-two-tier', format: 'lab', seconds: 12.3 });
  assert.deepEqual(safeProperties({ page: 'home', mode: 'password', reference_id: 'My private architecture', seconds: NaN }), { page: 'home' });
});

test('Tracker requires production configuration, queues startup events, respects opt-out and fails harmlessly', () => {
  const dom = new JSDOM('<html><head></head><body></body></html>', { url: 'https://lab.example/' });
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ Event: dom.window.Event, window: dom.window, document: dom.window.document, navigator: dom.window.navigator, localStorage: dom.window.localStorage })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  let stop = () => {};
  try {
    const config = { production: true, websiteId: 'test-id', scriptUrl: 'https://analytics.example/script.js', domains: 'lab.example' };
    initializeAnalytics({ ...config, production: false });
    initializeAnalytics({ ...config, domains: 'another.example' });
    initializeAnalytics({ ...config, websiteId: '' });
    initializeAnalytics({ ...config, scriptUrl: 'http://analytics.example/script.js' });
    assert.equal(document.querySelector('script'), null);
    localStorage.setItem('umami.disabled', '1');
    initializeAnalytics(config);
    assert.equal(document.querySelector('script'), null);
    localStorage.removeItem('umami.disabled');
    stop = initializeAnalytics(config);
    const script = document.querySelector('script')!;
    assert.equal(script.dataset.excludeSearch, 'true');
    assert.equal(script.dataset.excludeHash, 'true');
    assert.equal(script.dataset.doNotTrack, 'true');
    assert.equal(script.dataset.beforeSend, 'labAnalyticsBeforeSend');
    const sent: any[] = [];
    changeAnalyticsContext({ page: 'lab', lab_id: 'lab3-two-tier' });
    track('lab_opened');
    (window as any).umami = { track: (event: string, properties: unknown) => { sent.push({ event, properties }); return Promise.resolve(); } };
    script.dispatchEvent(new dom.window.Event('load'));
    assert.equal(sent.filter(item => item.event === 'lab_opened').length, 1);
    assert.equal(sent.find(item => item.event === 'lab_opened').properties.lab_id, 'lab3-two-tier');
    localStorage.setItem('umami.disabled', '1');
    assert.equal((window as any).labAnalyticsBeforeSend('event', {}), false);
    const count = sent.length;
    track('simulation_run');
    assert.equal(sent.length, count);
    localStorage.removeItem('umami.disabled');
    (window as any).umami.track = () => { throw new Error('offline'); };
    assert.doesNotThrow(() => track('simulation_run'));
    (window as any).umami.track = () => Promise.reject(new Error('offline'));
    assert.doesNotThrow(() => track('diagram_saved'));
  } finally {
    stop(); dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as any)[key];
    }
  }
});
