/**
 * UI integration tests (Phase 13). These render the REAL `ArchitectureProvider` (the seam every
 * component in `src/components/` calls into) inside a jsdom document via `react-dom`, and drive
 * it through the exact same public API a component would call - `addServiceNode`, `updateNodeData`,
 * `runScenario`, `injectFailure`, etc. This is deliberately not a mock: AWS semantics stay in the
 * engines (`engine/simulation`, `engine/failure`, `engine/validation`, `engine/analysis`,
 * `engine/trace`) exactly as `ArchitectureContext.tsx` wires them; these tests only assert on the
 * STATE/RESULTS React would then display, never re-implement or second-guess the engine logic.
 *
 * Run via: `npm run test:ui` (needs the esbuild-backed JSX loader in `test/support/`, since
 * `ArchitectureContext.tsx` contains JSX in its Provider - see test/support/jsxLoader.mjs). Lives
 * in its own `test/ui/` subdirectory (not `test/*.test.ts`) so the main `test`/`test:unit` scripts
 * - which run under plain `--experimental-strip-types` with no JSX support - never pick it up.
 */
import assert from 'node:assert';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/'
});
(globalThis as any).window = dom.window;
(globalThis as any).document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
(globalThis as any).HTMLElement = dom.window.HTMLElement;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const React = (await import('react')).default;
const { act } = React;
const { createRoot } = await import('react-dom/client');
const { ArchitectureProvider, useArchitecture } = await import('../../src/context/ArchitectureContext.tsx');
const { ServiceInspector } = await import('../../src/components/inspector/ServiceInspector.tsx');

type Api = ReturnType<typeof useArchitecture>;

/** Exposes the live `useArchitecture()` return value to the test via a ref - this IS the display
 *  layer's real read of context state; the test drives it exactly as a component would. */
function Harness({ apiRef }: { apiRef: { current: Api | null } }) {
  const ctx = useArchitecture();
  apiRef.current = ctx;
  return null;
}

const { SimulationControls } = await import('../../src/components/simulation/SimulationControls.tsx');
const { LabsModal } = await import('../../src/components/labs/LabsModal.tsx');
const { COURSE_LABS } = await import('../../src/data/courseLabs.ts');

async function mount(showInspector = false, showLabs = false, showControls = false) {
  const container = document.getElementById('root')!;
  const root = createRoot(container);
  const apiRef: { current: Api | null } = { current: null };
  await act(async () => {
    root.render(React.createElement(ArchitectureProvider, null, React.createElement(Harness, { apiRef }), showInspector ? React.createElement(ServiceInspector) : null, showLabs ? React.createElement(LabsModal, { isOpen: true, onClose: () => {} }) : null, showControls ? React.createElement(SimulationControls) : null));
  });
  return {
    api: () => apiRef.current!,
    act: async (fn: () => void) => {
      await act(async () => { fn(); });
    },
    unmount: async () => {
      await act(async () => { root.unmount(); });
    }
  };
}

test('Numbered connections select the path that animation playback highlights', async () => {
  const h = await mount();
  try {
    await h.act(() => {
      h.api().setNodes(['user', 'later', 'first'].map(id => ({ id, position: { x: 0, y: 0 }, data: { serviceId: id === 'user' ? 'user' : 'ec2', label: id, health: 'healthy', subnet: 'public' } })) as any);
      h.api().setEdges(['later', 'first'].map((target, index) => ({ id: target, source: 'user', target, data: { protocol: 'HTTPS', stepNumber: index === 0 ? 2 : 1 } })) as any);
      h.api().setScenario(s => ({ ...s, startNodeId: 'user', method: 'GET', path: '/' }));
    });
    await h.act(() => h.api().runScenario());
    await h.act(() => h.api().setIsPlaying(false));
    const result = h.api().simulationResult!;
    assert.ok(result.path.includes('first'));
    assert.ok(!result.path.includes('later'));
    const traversalIndex = result.steps.findIndex(s => s.sourceNodeId === 'user' && s.targetNodeId === 'first');
    assert.ok(traversalIndex >= 0);
    await h.act(() => h.api().setActiveStepIndex(0));
    for (let i = 0; i < traversalIndex; i++) await h.act(() => h.api().stepForward());
    assert.equal(h.api().activeStepIndex, traversalIndex);
    assert.equal(h.api().edges.find(e => e.id === 'first')?.data?.isSimulating, true);
    assert.equal(h.api().edges.find(e => e.id === 'later')?.data?.flowStatus, 'dimmed');
    assert.equal(h.api().edges.find(e => e.id === 'first')?.data?.stepNumber, 1);
  } finally {
    await h.unmount();
  }
});

test('1. Build architecture: adding services and connecting them updates the Architecture Model', async () => {
  const h = await mount();

  await h.act(() => h.api().addServiceNode('alb', { x: 0, y: 0 }));
  await h.act(() => h.api().addServiceNode('ec2', { x: 200, y: 0 }));

  const alb = h.api().nodes.find(n => n.data.serviceId === 'alb')!;
  const ec2 = h.api().nodes.find(n => n.data.serviceId === 'ec2')!;
  assert.ok(alb && ec2, 'both service nodes must exist on the model after addServiceNode');

  await h.act(() => h.api().onConnect({ source: alb.id, target: ec2.id, sourceHandle: null, targetHandle: null }));

  const edge = h.api().edges.find(e => e.source === alb.id && e.target === ec2.id);
  assert.ok(edge, 'the connection must appear in the Architecture Model edges');

  await h.unmount();
});

test('Labs: select instructions, run ALB failover, then load a clean editable reference', async () => {
  const h = await mount(false, true);
  try {
    const button = (text: string) => [...document.querySelectorAll('button')].find(b => b.textContent?.includes(text))!;
    assert.equal(document.querySelectorAll('nav[aria-label="Course labs"] button').length, 13);
    await h.act(() => button('Lab 5').click());
    assert.match(document.querySelector('a')!.href, /Lab-05-ALB.html$/);
    const runButtons = [...document.querySelectorAll('button')].filter(b => b.textContent === 'Run reference simulation');
    await h.act(() => runButtons[1].click());
    assert.equal(h.api().appMode, 'simulate');
    assert.equal(h.api().simulationResult?.success, true);
    assert.ok(h.api().simulationResult?.path.includes('lab-task-b'));
    await h.act(() => h.api().openLabReference(COURSE_LABS[3].references[0]));
    assert.equal(h.api().appMode, 'design');
    assert.equal(h.api().simulationResult, null);
    assert.equal(h.api().isPlaying, false);
    await h.act(() => h.api().runScenario());
    assert.equal(h.api().simulationResult?.success, true, h.api().simulationResult?.summary);
    assert.equal(COURSE_LABS[5].references[0].nodes.find(n => n.id === 'lab-task-a')!.data.health, 'healthy');
    await h.act(() => button('Lab 7').click());
    assert.match(document.querySelector('a')!.href, /Lab-07-EKS.html$/);
    await h.act(() => button('Lab 8').click());
    assert.match(document.querySelector('a')!.href, /Lab-08-EKS-scaling.html$/);
    const eksRuns = [...document.querySelectorAll('button')].filter(b => b.textContent === 'Run reference simulation');
    await h.act(() => eksRuns[1].click());
    assert.equal(h.api().simulationResult?.success, true);
    assert.match(h.api().simulationResult!.summary, /no scheduler, HPA/);
    assert.equal(h.api().nodes.find(n => n.id === 'lab-enrolment')!.data.replicas, 4);
  } finally { await h.unmount(); }
});

test('Labs: downloading a lab reference produces the exact file expected in src/data/labs/', async () => {
  const previous = (window as any).showSaveFilePicker;
  let saved = ''; let suggestedName = '';
  (window as any).showSaveFilePicker = async (opts: { suggestedName: string }) => {
    suggestedName = opts.suggestedName;
    return { createWritable: async () => ({ write: async (text: string) => { saved = text; }, close: async () => {} }) };
  };
  const h = await mount(false, true);
  try {
    const button = (text: string) => [...document.querySelectorAll('button')].find(b => b.textContent?.includes(text))!;
    await h.act(() => button('Lab 5').click());
    const download = document.querySelector('[aria-label^="Download lab reference"]') as HTMLButtonElement;
    assert.ok(download);
    await h.act(() => download.click());
    assert.equal(suggestedName, '05-lab5-alb.json');
    assert.deepEqual(JSON.parse(saved), COURSE_LABS[4].references[0]);
    // No upload/import surface for lab references - editing the file and placing it in
    // src/data/labs/ is the only path to a permanent change.
    assert.equal(document.querySelector('[aria-label="Import reference JSON"]'), null);
  } finally { await h.unmount(); (window as any).showSaveFilePicker = previous; }
});

test('2. Configure service: editing a node writes through to the Architecture Model', async () => {
  const h = await mount();
  await h.act(() => h.api().addServiceNode('rds', { x: 0, y: 0 }));
  const rds = h.api().nodes.find(n => n.data.serviceId === 'rds')!;

  await h.act(() => h.api().updateNodeData(rds.id, { multiAz: true, label: 'Orders DB' }));

  const updated = h.api().nodes.find(n => n.id === rds.id)!;
  assert.strictEqual(updated.data.multiAz, true, 'service configuration change must feed the Architecture Model');
  assert.strictEqual(updated.data.label, 'Orders DB');

  await h.unmount();
});

test('3. Send Request: view a successful flow with request path, decision points, and AWS explanation', async () => {
  const h = await mount();
  await h.act(() => h.api().loadTemplate('highly-available-multiaz'));
  await h.act(() => h.api().runScenario());

  const { simulationResult, requestTrace } = h.api();
  assert.ok(simulationResult, 'Send Request must produce a simulation result');
  assert.strictEqual(simulationResult!.success, true, 'the HA template should simulate a successful request');
  assert.ok(simulationResult!.path.length > 1, 'the result must expose the traversed request path');

  assert.ok(requestTrace, 'a successful simulation must produce an explainable AWS decision trace');
  assert.ok(requestTrace!.entries.length > 0, 'the trace must contain decision points');
  assert.ok(requestTrace!.entries.every(e => e.awsRule.length > 0), 'every decision point must carry an AWS explanation');
  assert.strictEqual(requestTrace!.final, 'SUCCESS');

  await h.unmount();
});

test('4. Send Request: unavailable targets produce a FAILURE trace and a WHY', async () => {
  const h = await mount();
  await h.act(() => h.api().loadTemplate('highly-available-multiaz'));

  // Fail every compute target so the load balancer has nothing healthy to route to.
  const ecsNodes = h.api().nodes.filter(n => n.data.serviceId === 'ecs');
  for (const n of ecsNodes) {
    await h.act(() => h.api().setNodeHealth(n.id, 'failed', 'Task crashed'));
  }
  await h.act(() => h.api().runScenario());

  const { simulationResult, requestTrace } = h.api();
  assert.strictEqual(simulationResult!.success, false, 'the request must fail with no healthy compute targets');
  assert.strictEqual(simulationResult!.statusCode, 503);

  if (requestTrace) {
    // No healthy targets is an availability failure, not an authorization denial.
    assert.strictEqual(requestTrace.final, 'FAILURE');
    assert.ok(requestTrace.why.length > 0, 'a failed request must carry a WHY');
  }

  await h.unmount();
});

test('5. Inject failure: the Failure Lab engine propagates a structured failure into the model', async () => {
  const h = await mount();
  await h.act(() => h.api().loadTemplate('highly-available-multiaz'));

  await h.act(() => h.api().injectFailure({
    targetResourceId: 'AZ-A',
    failureType: 'az_failure',
    severity: 'critical',
    trigger: 'manual',
    reason: 'Zone Outage (AZ-A Hardware Failure)'
  }));

  const { activeFailures, failureImpacts, effectiveNodes } = h.api();
  assert.strictEqual(activeFailures.length, 1, 'the injected failure must be tracked');
  assert.ok(failureImpacts.length > 0, 'the failure engine must produce an impact analysis');

  const azANode = effectiveNodes.find(n => n.id === 'node-ecs-az-a')!;
  assert.strictEqual(azANode.data.health, 'failed', 'the effective model must reflect the direct failure');
  const azBNode = effectiveNodes.find(n => n.id === 'node-ecs-az-b')!;
  assert.strictEqual(azBNode.data.health, 'healthy', 'a failure in one AZ must not affect resources in another AZ');

  await h.act(() => h.api().restoreAllNodes());
  assert.strictEqual(h.api().activeFailures.length, 0, 'restoring must clear the injected failure');

  await h.unmount();
});

test('6. Analyze architecture: validation and analysis engines are wired to the model', async () => {
  const h = await mount();
  await h.act(() => h.api().loadTemplate('basic-spof-app'));

  const { validationFindings, architecturalFindings } = h.api();
  assert.deepStrictEqual(
    validationFindings.filter(f => f.severity === 'CRITICAL'),
    [],
    'a structurally valid template should have no CRITICAL configuration findings'
  );
  assert.ok(
    architecturalFindings.some(f => f.subcategory === 'spof'),
    'the SPOF-ridden basic-spof-app template must be flagged by the analysis engine'
  );
  assert.ok(
    architecturalFindings.some(f => f.subcategory === 'redundancy'),
    'the Single-AZ, single-instance template must be flagged for missing redundancy'
  );

  await h.unmount();
});

test('7. React only displays state - the context never requires a component to compute AWS semantics itself', async () => {
  const h = await mount();
  await h.act(() => h.api().loadTemplate('highly-available-multiaz'));
  await h.act(() => h.api().runScenario());

  // Everything a component needs to display is already-computed data on the context - a
  // component (or this test, standing in for one) never calls into an engine module directly.
  const api = h.api();
  for (const key of ['analysis', 'validationFindings', 'architecturalFindings', 'simulationResult', 'requestTrace', 'failureImpacts']) {
    assert.ok(key in api, `context must expose "${key}" as ready-to-display state`);
  }

  await h.unmount();
});


test('Inspector scopes NACL configuration to subnets and keeps EC2 security groups', async () => {
  const h = await mount(true);
  try {
    await h.act(() => h.api().addServiceNode('ec2', { x: 0, y: 0 }));
    const config = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Config')!;
    await h.act(() => config.click());
    assert.match(document.body.textContent!, /Security Groups/);
    assert.doesNotMatch(document.body.textContent!, /Network ACL|NACL Rules/);
    await h.act(() => h.api().setShowNaclSideColumn(true));
    await h.act(() => h.api().addBoundaryNode('private_subnet', { x: 0, y: 0 }));
    assert.equal(h.api().showNaclSideColumn, false);
    assert.match(document.body.textContent!, /Network ACL/);
    await h.act(() => h.api().addServiceNode('s3', { x: 600, y: 600 }));
    assert.doesNotMatch(document.body.textContent!, /Attach Security Group|NACL Rules|Network ACL/);
  } finally { await h.unmount(); }
});


test('Labs 9–13: select, check supplied references, then recheck edited canvas configuration', async () => {
  const h = await mount(false, true, true);
  try {
    for (const number of [9, 10, 11, 12, 13]) {
      const nav = [...document.querySelectorAll('nav[aria-label="Course labs"] button')].find(b => b.textContent?.startsWith(`Lab ${number} ·`)) as HTMLElement;
      await h.act(() => nav.click());
      const lab = COURSE_LABS.find(l => l.number === number)!;
      assert.equal(document.querySelector('a')!.href, lab.sourceUrl);
      const run = [...document.querySelectorAll('button')].find(b => b.textContent === (number === 9 ? 'Run reference simulation' : 'Check reference configuration'))!;
      await h.act(() => run.click());
      assert.equal(h.api().simulationResult?.success, true, `Lab ${number} reference`);
      if (number !== 9) {
        assert.match(h.api().simulationResult!.summary, /Configuration PASS/);
        assert.ok(document.body.textContent?.includes('Check Configuration'));
      }
    }
    const revision = h.api().canvasRevision;
    await h.act(() => h.api().openLabReference(COURSE_LABS[10].references[0]));
    assert.ok(h.api().canvasRevision > revision, 'fresh lab triggers fit-to-view');
    const source = h.api().nodes.find(n => n.id === 'lab-source')!;
    await h.act(() => h.api().updateNodeData(source.id, { customConfig: { ...source.data.customConfig, versioning: false } }));
    await h.act(() => h.api().runScenario());
    assert.equal(h.api().simulationResult!.success, false);
    assert.match(h.api().simulationResult!.summary, /source requires bucket versioning/);
    assert.equal(COURSE_LABS[10].references[0].nodes.find(n => n.id === 'lab-source')!.data.customConfig!.versioning, true);
    await h.act(() => h.api().loadTemplate('highly-available-multiaz'));
    assert.equal(h.api().activeLabReference, null);
    await h.act(() => h.api().runScenario());
    assert.equal(h.api().simulationResult!.success, true);
    assert.doesNotMatch(h.api().simulationResult!.summary, /Configuration PASS/);
  } finally { await h.unmount(); }
});

test('Loaded IAM lab keeps policy evaluation when run again', async () => {
  const h = await mount();
  try {
    await h.act(() => h.api().openLabReference(COURSE_LABS[8].references[3]));
    await h.act(() => h.api().runScenario());
    assert.equal(h.api().simulationResult!.success, false);
    assert.ok(h.api().simulationResult!.steps.every(step => step.details?.decision?.component === 'IAM'));
    await h.act(() => h.api().clearCanvas());
    assert.equal(h.api().activeLabReference, null);
  } finally { await h.unmount(); }
});

test('Lab configuration editor applies JSON and rejects malformed settings', async () => {
  const h = await mount(true);
  try {
    await h.act(() => h.api().openLabReference(COURSE_LABS[9].references[0]));
    await h.act(() => h.api().setSelectedNodeId('lab-edge-viewer'));
    const button = (text: string) => [...document.querySelectorAll('button')].find(b => b.textContent === text)!;
    await h.act(() => button('Config').click());
    const textarea = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Lab configuration JSON"]')!;
    assert.ok(textarea);
    const setValue = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value')!.set!;
    const edit = async (value: string) => h.act(() => {
      setValue.call(textarea, value);
      textarea.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
    await edit('{');
    await h.act(() => button('Apply lab settings').click());
    assert.match(document.querySelector('[role="alert"]')!.textContent!, /valid JSON object/);
    assert.equal(h.api().nodes.find(n => n.id === 'lab-edge-viewer')!.data.customConfig!.version, '1');
    await edit(JSON.stringify({ ...h.api().nodes.find(n => n.id === 'lab-edge-viewer')!.data.customConfig, version: '$LATEST' }));
    await h.act(() => button('Apply lab settings').click());
    await h.act(() => h.api().runScenario());
    assert.equal(h.api().simulationResult!.success, false);
    assert.equal(h.api().simulationResult!.steps.find(step => step.id === 'lab-edge-viewer-version')!.status, 'failed');
  } finally { await h.unmount(); }
});


test('Lab AZ failure respects customer subnet placement', async () => {
  const h = await mount();
  try {
    await h.act(() => h.api().openLabReference(COURSE_LABS[1].references[0]));
    await h.act(() => h.api().failAvailabilityZone('AZ-A'));
    assert.equal(h.api().nodes.find(n => n.id === 'lab-probe')!.data.health, 'failed');
    assert.equal(h.api().nodes.find(n => n.id === 'lab-nat')!.data.health, 'failed');
    assert.equal(h.api().nodes.find(n => n.id === 'lab-bucket')!.data.health, 'healthy');
  } finally { await h.unmount(); }
});

test('ECS explorer is opt-in, persists component edits, groups services, and closes with Escape', async () => {
  const h = await mount(true);
  try {
    await h.act(() => h.api().addServiceNode('ecs', { x: 0, y: 0 }));
    const ecs = h.api().nodes.filter(n => n.data.serviceId === 'ecs').at(-1)!;
    await h.act(() => h.api().updateNodeData(ecs.id, { customConfig: { sentinel: 'preserved', ecsWorkspace: { clusterName: 'test-cluster' } } }));
    await h.act(() => h.api().setSelectedNodeId(ecs.id));
    assert.equal(document.querySelector('[aria-label="ECS component details"]'), null);
    const button = (text: string) => [...document.querySelectorAll('button')].find(b => b.textContent?.includes(text))!;
    const opener = button('More information');
    opener.focus();
    await h.act(() => opener.click());
    assert.ok(document.querySelector('[role="dialog"]'));
    await h.act(() => button('Task definition · not configured').click());
    await h.act(() => button('Add container').click());
    assert.equal(h.api().nodes.find(n => n.id === ecs.id)!.data.customConfig!.ecsWorkspace.containers.length, 1);
    assert.equal(h.api().nodes.find(n => n.id === ecs.id)!.data.customConfig!.sentinel, 'preserved');
    const cluster = document.querySelector('[aria-label="ECS cluster boundary"]')!;
    const serviceBoundary = cluster.querySelector('[aria-label^="Service boundary:"]')!;
    const task = serviceBoundary.querySelector('[aria-label="Task snapshot 1"]')!;
    assert.ok(task.querySelector('[aria-label^="Configure container"]'), 'containers must be nested inside tasks inside services inside the cluster');
    await h.act(() => (task.querySelector('[aria-label^="Configure container"]') as HTMLButtonElement).click());
    assert.match(document.querySelector('[aria-label="ECS component details"]')!.textContent!, /Container configuration/);
    const nameInput = [...document.querySelectorAll('[aria-label="ECS component details"] label')].find(l => l.textContent === 'Container name')!.querySelector('input')!;
    await h.act(() => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(nameInput, 'web-container');
      nameInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
    assert.match(task.textContent!, /web-container/);
    await h.act(() => h.api().updateNodeData(ecs.id, { customConfig: { ...h.api().nodes.find(n => n.id === ecs.id)!.data.customConfig, ecs: { runningCount: 0, desiredCount: 3 } } }));
    assert.equal(serviceBoundary.querySelectorAll('[aria-label^="Task snapshot "]').length, 0);
    assert.match(serviceBoundary.textContent!, /No observed running tasks/);
    await h.act(() => h.api().updateNodeData(ecs.id, { customConfig: { ...h.api().nodes.find(n => n.id === ecs.id)!.data.customConfig, ecs: { runningCount: 100, desiredCount: 100 } } }));
    assert.equal(serviceBoundary.querySelectorAll('[aria-label^="Task snapshot "]').length, 6);
    assert.match(serviceBoundary.textContent!, /94 more tasks/);

    const compute = cluster.querySelector('[aria-label="Cluster compute capacity"]')!;
    assert.ok(compute);
    assert.equal(serviceBoundary.contains(compute), false, 'compute must not be owned by a service');
    assert.equal(compute.querySelector('[aria-label^="Service boundary:"]'), null);
    await h.act(() => button('compute reference').click());
    const select = document.querySelector('[role="dialog"] select') as HTMLSelectElement;
    await h.act(() => { select.value = 'FARGATE'; select.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
    assert.match(document.querySelector('[role="dialog"]')!.textContent!, /Fargate · no customer-managed EC2 hosts/);
    assert.doesNotMatch(document.querySelector('[aria-label="ECS component details"]')!.textContent!, /EC2 instance type/);
    assert.equal(h.api().nodes.find(n => n.id === ecs.id)!.data.customConfig!.ecs.launchType, 'FARGATE');
    await h.act(() => h.api().addServiceNode('ecs', { x: 200, y: 0 }));
    const second = h.api().nodes.filter(n => n.data.serviceId === 'ecs').at(-1)!;
    await h.act(() => h.api().updateNodeData(second.id, { customConfig: { ecsWorkspace: { clusterName: 'test-cluster', serviceName: 'Second service' } } }));
    await h.act(() => h.api().setSelectedNodeId(ecs.id));
    // Selection changes dismiss the overlay; reopen it explicitly.
    await h.act(() => button('More information').click());
    assert.equal(document.querySelectorAll('[aria-label="Cluster services"] > section').length, 2);
    await h.act(() => button('Second service').click());
    assert.match(document.querySelector('[role="dialog"]')!.textContent!, /Second service/);
    const modal = document.querySelector('[role="dialog"]')!;
    await h.act(() => modal.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    assert.equal(document.querySelector('[role="dialog"]'), null);
    await h.act(() => button('More information').click());
    assert.match(document.querySelector('[role="dialog"]')!.textContent!, /Fargate · no customer-managed EC2 hosts/);
  } finally { await h.unmount(); }
});

test('ECS connectivity map: shows an ALB fanning out to multiple cluster services, a downstream dependency, and hides intra-cluster edges', async () => {
  const h = await mount(true);
  try {
    const button = (text: string) => [...document.querySelectorAll('button')].find(b => b.textContent?.includes(text))!;

    await h.act(() => h.api().addServiceNode('alb', { x: 0, y: 0 }));
    await h.act(() => h.api().addServiceNode('ecs', { x: 200, y: 0 }));
    await h.act(() => h.api().addServiceNode('ecs', { x: 200, y: 150 }));
    await h.act(() => h.api().addServiceNode('rds', { x: 400, y: 0 }));

    const alb = h.api().nodes.find(n => n.data.serviceId === 'alb')!;
    const [ecsA, ecsB] = h.api().nodes.filter(n => n.data.serviceId === 'ecs');
    const rds = h.api().nodes.find(n => n.data.serviceId === 'rds')!;

    await h.act(() => h.api().updateNodeData(ecsA.id, { customConfig: { ecsWorkspace: { clusterName: 'shared', serviceName: 'API service' } } }));
    await h.act(() => h.api().updateNodeData(ecsB.id, { customConfig: { ecsWorkspace: { clusterName: 'shared', serviceName: 'Worker service' } } }));

    // ALB fans out to both cluster services; API service also depends on RDS; the two cluster
    // services are also connected to each other (an intra-cluster edge that should NOT appear as
    // an upstream/downstream lane, only as a count).
    await h.act(() => h.api().onConnect({ source: alb.id, target: ecsA.id, sourceHandle: null, targetHandle: null }));
    await h.act(() => h.api().onConnect({ source: alb.id, target: ecsB.id, sourceHandle: null, targetHandle: null }));
    await h.act(() => h.api().onConnect({ source: ecsA.id, target: rds.id, sourceHandle: null, targetHandle: null }));
    await h.act(() => h.api().onConnect({ source: ecsA.id, target: ecsB.id, sourceHandle: null, targetHandle: null }));

    await h.act(() => h.api().setSelectedNodeId(ecsA.id));
    await h.act(() => button('More information').click());

    // Scoped specifically to the connectivity map (now in the right-hand detail sidebar), not the
    // topology diagram in the main column - both render a "Worker service" element, so a
    // document-wide text/button search would be ambiguous.
    const map = document.querySelector('[aria-label="ECS cluster connectivity map"]')!;
    assert.match(map.textContent!, /Cluster: shared/);
    assert.ok(map.textContent!.includes(alb.data.label), 'ALB must appear as an inbound connection');
    assert.ok(map.textContent!.includes(rds.data.label), 'RDS must appear as an outbound connection');

    // A cluster is a logical grouping of services - the ALB and RDS are separate AWS resources,
    // not part of the cluster, so they must render OUTSIDE the cluster boundary box, never nested
    // inside it.
    const boundary = map.querySelector('[aria-label="Cluster boundary"]')!;
    assert.ok(!boundary.textContent!.includes(alb.data.label), 'ALB must not be nested inside the cluster boundary');
    assert.ok(!boundary.textContent!.includes(rds.data.label), 'RDS must not be nested inside the cluster boundary');

    // ALB fans out to BOTH services, but is a single real resource - it must be drawn once, with a
    // caption naming every service it reaches, not duplicated once per service.
    const albMentions = map.textContent!.split(alb.data.label).length - 1;
    assert.equal(albMentions, 1, `ALB should be drawn exactly once (deduplicated), got ${albMentions} mentions`);
    assert.match(map.textContent!, /API service, Worker service/, 'the ALB caption must name both services it fans out to');

    // Restored visual language: ALB shown as its own icon+label box, connected to the ECS service
    // box by a directional arrow - not just a text chip. Only the two boundary-crossing arrows
    // (outside the cluster boundary box) are counted here; the small in-box "routed to these
    // tasks"/"these tasks call out" markers are checked separately below.
    const albBox = [...map.querySelectorAll('div')].find(d => d.textContent === alb.data.label && d.querySelector('svg'));
    assert.ok(albBox, 'ALB must render as its own icon+label box');
    const crossingArrows = [...map.querySelectorAll('[aria-hidden="true"] svg.lucide-arrow-down')].filter(el => !boundary.contains(el));
    assert.equal(crossingArrows.length, 2, `expected one boundary-crossing arrow for the deduplicated ALB box + one for RDS, got ${crossingArrows.length}`);

    // A line pointing at "the task" specifically isn't possible without fabricating which task -
    // the model has no per-task identity - so instead the task-pool row itself gets a marker: API
    // service is both routed to (by the ALB) and calls out (to RDS); Worker service only receives.
    assert.match(map.textContent!, /routed to these tasks/);
    assert.match(map.textContent!, /these tasks call out/);
    const routedMarkers = map.textContent!.match(/routed to these tasks/g) ?? [];
    assert.equal(routedMarkers.length, 2, 'both API service and Worker service are targeted by the ALB');
    const callsOutMarkers = map.textContent!.match(/these tasks call out/g) ?? [];
    assert.equal(callsOutMarkers.length, 1, 'only API service calls out (to RDS)');

    // The intra-cluster ECS-to-ECS edge must be reported as a count, not listed as an in/out chip.
    assert.match(map.textContent!, /1 connection.*inside this cluster/);

    // One task square per running task, colored by that service's health.
    const mapButton = (text: string) => [...map.querySelectorAll('button')].find(b => b.textContent?.includes(text))!;
    const apiCard = mapButton('API service').closest('div')!;
    assert.equal(apiCard.querySelectorAll('[role="img"] > span').length, 1, 'API service has 1 running task by default');
    assert.ok(apiCard.querySelector('[role="img"] > span')!.className.includes('bg-emerald-600'), 'a healthy task square must be emerald');

    // Bumping desired/running task count must be reflected immediately, with a matching color
    // change when health changes too - this is the live-update behavior that was requested.
    await h.act(() => h.api().updateNodeData(ecsA.id, {
      health: 'degraded',
      customConfig: { ecsWorkspace: { clusterName: 'shared', serviceName: 'API service' }, ecs: { runningCount: 3, desiredCount: 5 } }
    }));
    const updatedMap = document.querySelector('[aria-label="ECS cluster connectivity map"]')!;
    const updatedApiCard = [...updatedMap.querySelectorAll('button')].find(b => b.textContent?.includes('API service'))!.closest('div')!;
    const runningSquares = [...updatedApiCard.querySelectorAll('[role="img"] > span')].filter(el => el.className.includes('bg-'));
    const gapSquares = updatedApiCard.querySelectorAll('[role="img"] > span.border-dashed');
    assert.equal(runningSquares.length, 3, 'must show exactly 3 running-task squares after the update');
    assert.equal(gapSquares.length, 2, 'must show exactly 2 desired-but-not-running squares (5 desired - 3 running)');
    assert.ok(runningSquares.every(el => el.className.includes('bg-amber-500')), 'running task squares must turn amber to match the degraded health update');

    // Clicking THIS service's name (not the topology's own service-boundary button below it)
    // jumps to that service's Network section.
    await h.act(() => mapButton('Worker service').click());
    assert.match(document.querySelector('[aria-label="ECS component details"]')!.textContent!, /Networking & connections/);
  } finally { await h.unmount(); }
});

test('ECS connectivity map: shows an empty state when the cluster has no external connections', async () => {
  const h = await mount(true);
  try {
    const button = (text: string) => [...document.querySelectorAll('button')].find(b => b.textContent?.includes(text))!;
    await h.act(() => h.api().addServiceNode('ecs', { x: 0, y: 0 }));
    const ecs = h.api().nodes.filter(n => n.data.serviceId === 'ecs').at(-1)!;
    await h.act(() => h.api().setSelectedNodeId(ecs.id));
    await h.act(() => button('More information').click());
    const dialog = document.querySelector('[role="dialog"]')!;
    assert.match(dialog.textContent!, /No connections into or out of this cluster yet/);
  } finally { await h.unmount(); }
});

test('Service lessons follow their icons, preserve architecture, and distinguish scaling from RunTask', async () => {
  const h = await mount(true);
  try {
    const button = (text: string) => [...document.querySelectorAll('button')].find(b => b.textContent?.includes(text))!;
    const openService = async (service: string) => {
      await h.act(() => h.api().addServiceNode(service, { x: 0, y: 0 }));
      const node = h.api().nodes.filter(n => n.data.serviceId === service).at(-1)!;
      await h.act(() => h.api().setSelectedNodeId(node.id));
      await h.act(() => button('More information').click());
      return node;
    };
    await openService('ecs');
    assert.ok(document.querySelector('[aria-label="ECS cluster boundary"]'));
    assert.equal(document.querySelector('[aria-label="ECS supporting concepts"]'), null);
    assert.equal(document.querySelector('[aria-label="Scaling policy demonstration"]'), null);
    await openService('sqs');
    const lab = () => document.querySelector('[aria-label="Scaling policy demonstration"]')!;
    assert.match(lab().textContent!, /backlog/);
    const before = JSON.stringify(h.api().nodes);
    const slider = lab().querySelector('input[type="range"]')!;
    await h.act(() => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(slider, '300');
      slider.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
    await h.act(() => button('Animate scaling').click());
    await h.act(() => button('Pause').click());
    assert.match(lab().textContent!, /Capacity bounds 1–8: 6/);
    await h.act(() => button('Next stage').click());
    await h.act(() => button('Next stage').click());
    assert.match(lab().textContent!, /Starting/);
    await h.act(() => button('Next stage').click());
    assert.match(lab().textContent!, /6 ready \/ 6 desired/);
    assert.equal(JSON.stringify(h.api().nodes), before);
    await h.act(() => button('Reset demo').click());
    assert.match(lab().textContent!, /2 ready \/ 2 desired/);
    const available = lab().querySelector('input[type="checkbox"]') as HTMLInputElement;
    await h.act(() => available.click());
    await h.act(() => button('Animate scaling').click());
    assert.match(lab().textContent!, /Insufficient metric data/);
    assert.equal(JSON.stringify(h.api().nodes), before);
    await openService('nlb');
    assert.equal(document.querySelector('[aria-label="Scaling policy demonstration"]'), null);
    const routing = () => document.querySelector('[aria-label="Load balancer demonstration"]')!;
    assert.match(routing().textContent!, /NLB · Layer 4/);
    await h.act(() => button('Send on same TCP flow').click());
    const receiving = () => [...routing().querySelectorAll('strong')].find(n => n.parentElement?.textContent?.includes('Receiving traffic'))?.textContent;
    assert.equal(receiving(), 'api target 1');
    await h.act(() => button('Send on same TCP flow').click());
    assert.equal(receiving(), 'api target 1');
    await h.act(() => button('Open new connection').click());
    await h.act(() => button('Send on same TCP flow').click());
    assert.equal(receiving(), 'api target 2');
    assert.equal(routing().querySelectorAll('select').length, 1, 'NLB cannot switch itself to an ALB');
    await openService('alb');
    assert.match(routing().textContent!, /ALB · Layer 7/);
    await h.act(() => button('Send HTTP request').click());
    assert.equal(receiving(), 'api target 1');
    const path = routing().querySelector('select')!;
    await h.act(() => { path.value = '/'; path.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
    await h.act(() => button('Send HTTP request').click());
    assert.equal(receiving(), 'web target 1');
    assert.equal(routing().querySelector('[aria-label="Load balancer boundary"]')!.querySelector('[aria-label="api example target group"]'), null);
    await openService('eventbridge');
    const events = () => document.querySelector('[aria-label="EventBridge task invocation demonstration"]')!;
    const eventBefore = JSON.stringify(h.api().nodes);
    await h.act(() => button('Publish example event').click());
    assert.match(events().textContent!, /1 standalone task examples/);
    assert.match(events().textContent!, /desired count 2 \(unchanged\)/);
    const eventSelect = events().querySelector('select')!;
    await h.act(() => { eventSelect.value = 'OrderCancelled'; eventSelect.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
    await h.act(() => button('Publish example event').click());
    assert.match(events().textContent!, /Event did not match/);
    assert.match(events().textContent!, /1 standalone task examples/);
    assert.equal(JSON.stringify(h.api().nodes), eventBefore);
    assert.doesNotMatch(events().textContent!, /ChangeInCapacity/);
    await openService('cloudwatch');
    assert.match(lab().textContent!, /CloudWatch provides metrics and alarms/);
    assert.equal([...lab().querySelectorAll('option')].some(o => o.value === 'scheduled'), false);
    const policy = lab().querySelector('select')!;
    await h.act(() => { policy.value = 'step'; policy.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
    for (const expression of ['ChangeInCapacity', 'PercentChangeInCapacity', 'ExactCapacity']) assert.match(lab().textContent!, new RegExp(expression));
    await openService('ec2_auto_scaling');
    assert.match(lab().textContent!, /EC2 Auto Scaling group/);
    assert.ok([...lab().querySelectorAll('option')].some(o => o.value === 'scheduled'));
    await openService('eventbridge_scheduler');
    assert.match(events().textContent!, /Schedule → RunTask/);
    await openService('ecr_registry');
    assert.match(document.querySelector('[role="dialog"]')!.textContent!, /ECR repository/);
  } finally { await h.unmount(); }
});

test('Draft roundtrip restores workspace, scenario, failures, results and viewport; malformed import is atomic', async () => {
  const h = await mount();
  try {
    await h.act(() => h.api().loadTemplate('highly-available-multiaz'));
    await h.act(() => {
      h.api().setDraftName('My networking lab');
      h.api().setScenario(s => ({ ...s, path: '/saved-draft' }));
      h.api().setDraftViewport({ x: 42, y: -30, zoom: 0.8 });
      h.api().setPlaybackSpeed(2);
      h.api().injectFailure({ targetResourceId: 'node-ecs-az-a', failureType: 'instance_unavailable', severity: 'high', trigger: 'manual' });
    });
    await h.act(() => h.api().runScenario());
    await h.act(() => h.api().setIsPlaying(false));
    const saved = h.api().exportDraft();
    const snapshot = JSON.parse(saved).state;
    await h.act(() => h.api().clearCanvas());
    await h.act(() => h.api().importDraft(saved));
    assert.equal(h.api().draftName, 'My networking lab');
    assert.deepStrictEqual(h.api().scenario, snapshot.scenario);
    assert.deepStrictEqual(h.api().activeFailures, snapshot.activeFailures);
    assert.deepStrictEqual(h.api().simulationResult, snapshot.simulationResult);
    assert.deepStrictEqual(h.api().draftViewport, snapshot.viewport);
    assert.equal(h.api().nodes.length, snapshot.nodes.length);
    assert.equal(h.api().edges.length, snapshot.edges.length);
    assert.equal(h.api().isPlaying, false);
    assert.equal(h.api().playbackSpeed, 2);
    const before = h.api().nodes;
    assert.throws(() => h.api().importDraft('{"version":99}'), /Unsupported/);
    assert.strictEqual(h.api().nodes, before);
    const broken = JSON.parse(saved); broken.state.edges[0].target = 'missing';
    assert.throws(() => h.api().importDraft(JSON.stringify(broken)), /missing nodes/);
    assert.strictEqual(h.api().nodes, before);
  } finally { await h.unmount(); }
});

test('Release indicator offers same-channel update and restores a tab recovery draft', async () => {
  const { ReleaseStatus } = await import('../../src/components/layout/ReleaseStatus.tsx');
  const { UPDATE_RECOVERY_KEY } = await import('../../src/engine/releases/release.ts');
  const previousFetch = globalThis.fetch;
  const previousStorage = (globalThis as any).sessionStorage;
  (globalThis as any).sessionStorage = dom.window.sessionStorage;
  const h = await mount();
  let saved: string;
  try { saved = h.api().exportDraft(); } finally { await h.unmount(); }
  dom.window.sessionStorage.setItem(UPDATE_RECOVERY_KEY, saved!);
  globalThis.fetch = (async () => ({ ok: true, json: async () => ({ version: '1.1.0', buildId: 'new-build', channel: 'preview', draftVersion: 2 }) })) as any;
  const root = createRoot(document.getElementById('root')!);
  const oldConfirm = window.confirm;
  window.confirm = () => true;
  try {
    await act(async () => root.render(React.createElement(ArchitectureProvider, null, React.createElement(ReleaseStatus))));
    assert.match(document.body.textContent ?? '', /preview/);
    assert.match(document.body.textContent ?? '', /Update available/);
    const restore = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Restore work'))!;
    assert.ok(restore);
    await act(async () => restore.click());
    assert.equal(dom.window.sessionStorage.getItem(UPDATE_RECOVERY_KEY), null);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = previousFetch;
    (globalThis as any).sessionStorage = previousStorage;
    window.confirm = oldConfirm;
  }
});

test('Enabling NACL on separate subnets creates independent rules and preserves them in drafts', async () => {
  const h = await mount(true);
  try {
    const subnets = h.api().nodes.filter(n => ['public_subnet', 'private_subnet'].includes(String(n.data.boundaryType)));
    assert.ok(subnets.length >= 2);
    for (const subnet of subnets.slice(0, 2)) {
      await h.act(() => h.api().setSelectedNodeId(subnet.id));
      const enable = Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Enable NACL rule set');
      assert.ok(enable);
      await h.act(() => enable!.click());
      assert.ok(h.api().nodes.find(n => n.id === subnet.id)?.data.customNacl);
    }
    const [a, b] = subnets.slice(0, 2).map(n => h.api().nodes.find(node => node.id === n.id)!);
    assert.notStrictEqual(a.data.customNacl, b.data.customNacl);
    const saved = h.api().exportDraft();
    await h.act(() => h.api().importDraft(saved));
    assert.deepStrictEqual(h.api().nodes.find(n => n.id === a.id)?.data.customNacl, a.data.customNacl);
  } finally { await h.unmount(); }
});

test('hasMissingReturnNacl (drives the Problem 3.1 canvas banner) only reflects the actual missing-return condition, not every custom NACL', async () => {
  // ArchitectureCanvas.tsx (not mounted by this harness) shows its "addressing problem 3.1" banner
  // purely off `hasMissingReturnNacl` - asserting on that context value here is equivalent to
  // asserting on the banner's visibility, without needing a real ReactFlow render in jsdom.
  const h = await mount(true);
  try {
    assert.strictEqual(h.api().hasMissingReturnNacl, false);

    const subnet = h.api().nodes.find(n => ['public_subnet', 'private_subnet'].includes(String(n.data.boundaryType)))!;
    await h.act(() => h.api().setSelectedNodeId(subnet.id));
    const enable = Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Enable NACL rule set');
    assert.ok(enable);
    await h.act(() => enable!.click());
    assert.ok(h.api().nodes.find(n => n.id === subnet.id)?.data.customNacl, 'preset should be applied');
    assert.strictEqual(h.api().hasMissingReturnNacl, false, 'enabling the NACL preset must not trigger the Problem 3.1 banner');

    await h.act(() => h.api().loadTemplate('nacl-custom-stateless-timeout'));
    assert.strictEqual(h.api().hasMissingReturnNacl, true, 'the actual Problem 3.1 reference diagram must still trigger its banner');
  } finally { await h.unmount(); }
});

test('Live SNS fanout persists queue runtime through draft restore', async () => {
  const h = await mount();
  try {
    let topicId = '', queueId = '';
    await h.act(() => { h.api().addServiceNode('sns'); h.api().addServiceNode('sqs'); });
    topicId = h.api().nodes.find(n => n.data.serviceId === 'sns')!.id;
    queueId = h.api().nodes.find(n => n.data.serviceId === 'sqs')!.id;
    await h.act(() => {
      h.api().updateNodeData(queueId, { customConfig: { allowedTopicIds: [topicId] } });
      h.api().setEdges([{ id: 'subscription', source: topicId, target: queueId, data: { protocol: 'Message', interactionType: 'asynchronous', isCriticalDependency: false, timeoutMs: 1000 } }]);
      h.api().setScenario(s => ({ ...s, startNodeId: topicId }));
    });
    await h.act(() => h.api().runScenario());
    assert.equal(h.api().nodes.find(n => n.id === queueId)!.data.customConfig?.serviceRuntime.messages.length, 1);
    const saved = h.api().exportDraft();
    await h.act(() => h.api().clearCanvas());
    await h.act(() => h.api().importDraft(saved));
    assert.equal(h.api().nodes.find(n => n.id === queueId)!.data.customConfig?.serviceRuntime.messages.length, 1);
  } finally { await h.unmount(); }
});

test('Connection drawing selects legal S3 interaction and rejects invalid inspector edits', async () => {
  const h = await mount();
  const oldAlert = window.alert;
  const alerts: string[] = []; window.alert = message => { alerts.push(String(message)); };
  try {
    await h.act(() => { h.api().addServiceNode('user'); h.api().addServiceNode('s3'); });
    const source = h.api().nodes.find(n => n.data.serviceId === 'user')!.id;
    const target = h.api().nodes.find(n => n.data.serviceId === 's3')!.id;
    await h.act(() => h.api().onConnect({ source, target, sourceHandle: null, targetHandle: null }));
    const edge = h.api().edges.find(e => e.source === source && e.target === target)!;
    assert.ok(edge);
    await h.act(() => h.api().updateEdgeData(edge.id, { protocol: 'SQL' }));
    assert.notEqual(h.api().edges.find(e => e.id === edge.id)!.data?.protocol, 'SQL');
    assert.ok(alerts.some(message => message.includes('SQL')));
  } finally { window.alert = oldAlert; await h.unmount(); }
});

test('ASG controls create visible instance state, persist it, and reset without removing baseline members', async () => {
  const { ASG_REFERENCE } = await import('../../src/data/asgReference.ts');
  const h = await mount(true);
  try {
    const manualNodes = structuredClone(ASG_REFERENCE.nodes); manualNodes.find(n => n.id === 'asg-group')!.data.customConfig.asg.metricSource = 'manual';
    await h.act(() => { h.api().setNodes(manualNodes as any); h.api().setEdges(structuredClone(ASG_REFERENCE.edges) as any); h.api().setSelectedNodeId('asg-group'); });
    await h.act(() => [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Config')!.click());
    const panel = () => document.querySelector('[aria-label="ASG scaling simulation"]')!;
    assert.ok(panel());
    const button = (text: string) => [...panel().querySelectorAll('button')].find(b => b.textContent === text)!;
    await h.act(() => button('Advance one period').click());
    assert.match(panel().textContent!, /INSUFFICIENT_DATA/);
    await h.act(() => button('Advance one period').click());
    const instance = h.api().nodes.find(n => n.data.customConfig?.asgInstance?.generated)!;
    assert.ok(instance); assert.equal(instance.data.customConfig!.asgInstance.state, 'Launching');
    await h.act(() => button('Advance one period').click());
    assert.equal(h.api().nodes.find(n => n.id === instance.id)!.data.customConfig!.asgInstance.state, 'InService');
    await h.act(() => h.api().setSelectedNodeId('asg-alarm'));
    assert.ok(panel()); assert.match(panel().textContent!, /Desired: 3/);
    await h.act(() => button('Reset scaling').click());
    assert.equal(h.api().nodes.some(n => n.id === instance.id), false);
    assert.ok(h.api().nodes.some(n => n.id === 'asg-web-1'));
    await h.act(() => button('Advance one period').click());
    await h.act(() => button('Advance one period').click());
    await h.act(() => h.api().resetSimulation());
    assert.equal(h.api().nodes.some(n => n.data.customConfig?.asgInstance?.generated), false);
    assert.ok(h.api().edges.every(e => h.api().nodes.some(n => n.id === e.source) && h.api().nodes.some(n => n.id === e.target)));
  } finally { await h.unmount(); }
});

test('Send Request scales on canvas with no inspector; CloudWatch exposes policy selection', async () => {
  const { ASG_REFERENCE } = await import('../../src/data/asgReference.ts');
  const h = await mount(true);
  try {
    await h.act(() => { h.api().setNodes(structuredClone(ASG_REFERENCE.nodes) as any); h.api().setEdges(structuredClone(ASG_REFERENCE.edges) as any); h.api().setScenario(prev => ({ ...prev, startNodeId: 'asg-alb', trafficLevel: 'normal', method: 'GET', path: '/' })); h.api().setSelectedNodeId(null); });
    await h.act(() => h.api().runScenario());
    await h.act(() => h.api().runScenario());
    assert.equal(h.api().nodes.filter(n => n.data.customConfig?.asgInstance?.generated).length, 1);
    assert.match(h.api().simulationResult!.summary, /synthetic 120 requests/);
    await h.act(() => h.api().setSelectedNodeId('asg-alarm'));
    await h.act(() => [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Config')!.click());
    assert.ok(document.querySelector('[aria-label="Scaling policy type"]'));
    assert.equal([...document.querySelectorAll('button')].some(b => b.textContent === 'Play scaling'), true);
    assert.ok([...document.querySelectorAll('button')].some(b => b.textContent?.includes('Faster time')));
    assert.equal((document.querySelector('[aria-label="Scaling policy type"]') as HTMLSelectElement).disabled, false);
    const policy = document.querySelector('[aria-label="Scaling policy type"]') as HTMLSelectElement;
    await h.act(() => { policy.value = 'target'; policy.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
    assert.equal(h.api().nodes.find(n => n.id === 'asg-group')!.data.customConfig!.asg.policyType, 'target');
    assert.equal(h.api().nodes.some(n => n.data.customConfig?.asgInstance?.generated), false);
    assert.equal(h.api().nodes.find(n => n.id === 'asg-group')!.data.customConfig!.asgRuntime, undefined);
    assert.ok([...policy.options].some(option => option.value === 'step'));
    assert.ok([...policy.options].some(option => option.value === 'scheduled'));
    assert.equal([...document.querySelectorAll('button')].some(b => b.textContent?.trim() === 'More information'), false);
    await h.act(() => { policy.value = 'scheduled'; policy.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
    const advance = () => [...document.querySelectorAll('button')].find(b => b.textContent === 'Advance one period')!;
    await h.act(() => advance().click());
    await h.act(() => advance().click());
    assert.equal(h.api().nodes.filter(n => n.data.customConfig?.asgInstance?.generated).length, 2);
    for (let i = 0; i < 3; i++) await h.act(() => advance().click());
    assert.equal(h.api().nodes.filter(n => n.data.customConfig?.asgInstance?.generated).length, 0);
  } finally { await h.unmount(); }
});

test('Drawing scaling links selects management contracts without allowing ASG application traffic', async () => {
  const h = await mount(); const previousAlert = window.alert; const alerts: string[] = [];
  window.alert = message => { alerts.push(String(message)); };
  try {
    await h.act(() => { for (const id of ['ec2_auto_scaling', 'ec2', 'cloudwatch', 'alb']) h.api().addServiceNode(id); });
    const find = (service: string) => h.api().nodes.filter(n => n.data.serviceId === service).at(-1)!;
    for (const [source, target] of [['ec2_auto_scaling', 'ec2'], ['cloudwatch', 'ec2_auto_scaling'], ['alb', 'cloudwatch']]) {
      await h.act(() => h.api().onConnect({ source: find(source).id, target: find(target).id, sourceHandle: null, targetHandle: null }));
      const edge = h.api().edges.find(e => e.source === find(source).id && e.target === find(target).id)!;
      assert.ok(edge); assert.equal(edge.data?.relationship, 'manages'); assert.equal(edge.data?.protocol, 'Event'); assert.equal(edge.data?.isCriticalDependency, false);
    }
    assert.deepEqual(alerts, []);
  } finally { window.alert = previousAlert; await h.unmount(); }
});

test('Export saves a complete named draft through the file picker and retains upload controls', async () => {
  const { ExportModal } = await import('../../src/components/export/ExportModal.tsx');
  const { parseDraft } = await import('../../src/engine/persistence/draft.ts');
  const previous = (window as any).showSaveFilePicker;
  let suggested = '', written = '', closed = false;
  (window as any).showSaveFilePicker = async (options: any) => { suggested = options.suggestedName; return { name: suggested, createWritable: async () => ({ write: async (value: string) => { written = value; }, close: async () => { closed = true; } }) }; };
  const root = createRoot(document.getElementById('root')!);
  const apiRef: { current: Api | null } = { current: null };
  try {
    await act(async () => root.render(React.createElement(ArchitectureProvider, null, React.createElement(Harness, { apiRef }), React.createElement(ExportModal, { isOpen: true, onClose: () => {} }))));
    await act(async () => apiRef.current!.setDraftName('Networking Lab'));
    const buttons = () => [...document.querySelectorAll('button')];
    await act(async () => buttons().find(b => b.textContent === 'Download JSON')!.click());
    assert.equal(suggested, 'Networking Lab.json'); assert.equal(closed, true);
    const saved = parseDraft(written);
    assert.equal(saved.draftName, 'Networking Lab');
    assert.deepEqual(saved.nodes, JSON.parse(JSON.stringify(apiRef.current!.nodes)));
    assert.ok(document.querySelector('[aria-label="Upload draft JSON file"]'));
    (window as any).showSaveFilePicker = async () => { throw new dom.window.DOMException('Cancelled', 'AbortError'); };
    await act(async () => buttons().find(b => b.textContent === 'Download JSON')!.click());
    assert.equal(buttons().find(b => b.textContent === 'Download JSON')!.disabled, false);
  } finally { await act(async () => root.unmount()); (window as any).showSaveFilePicker = previous; }
});

test('Reference library exports source-compatible JSON and loads an independent copy', async () => {
  const { ReferenceLibrary } = await import('../../src/components/references/ReferenceLibrary.tsx');
  const { parseReference } = await import('../../src/engine/persistence/references.ts');
  const originalPicker = (window as any).showSaveFilePicker;
  const originalStorage = (globalThis as any).localStorage;
  const originalConfirm = window.confirm;
  const store = new Map<string, string>();
  (globalThis as any).localStorage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value) };
  window.confirm = () => true;
  let saved = '';
  (window as any).showSaveFilePicker = async () => ({ createWritable: async () => ({ write: async (text: string) => { saved = text; }, close: async () => {} }) });
  const root = createRoot(document.getElementById('root')!); const apiRef: { current: Api | null } = { current: null };
  try {
    await act(async () => root.render(React.createElement(ArchitectureProvider, null, React.createElement(Harness, { apiRef }), React.createElement(ReferenceLibrary))));
    const name = [...document.querySelectorAll('label')].find(l => l.textContent?.includes('Reference name'))!.querySelector('input')!;
    await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(name, 'My classroom reference'); name.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
    await act(async () => [...document.querySelectorAll('button')].find(b => b.textContent === 'Save as reference')!.click());
    const reference = parseReference(saved);
    assert.equal(reference.name, 'My classroom reference');
    assert.deepEqual(reference.nodes, JSON.parse(JSON.stringify(apiRef.current!.nodes)));
    await act(async () => apiRef.current!.loadTemplate(reference.id, reference));
    assert.deepEqual(apiRef.current!.scenario, reference.scenario);
    assert.notEqual(apiRef.current!.nodes, reference.nodes);
    await act(async () => {
      apiRef.current!.setNodes(previous => previous.map((node, index) => index === 0 ? { ...node, position: { x: 123, y: 456 } } : node));
      apiRef.current!.setScenario(previous => ({ ...previous, startNodeId: 'removed-start' }));
    });
    await act(async () => [...document.querySelectorAll('button')].find(b => b.textContent === 'Save as reference')!.click());
    const updated = parseReference(saved);
    assert.equal(updated.id, reference.id);
    assert.equal(updated.description, reference.description);
    assert.equal(updated.scenario!.startNodeId, '');
    assert.deepEqual(updated.nodes[0].position, { x: 123, y: 456 });
    assert.match(document.querySelector('[role="status"]')!.textContent!, /removed request start node was cleared/);

    // Import was removed - the JSON folder + rebuild is the only path to a permanent reference now.
    assert.equal(document.querySelector('[aria-label="Import reference JSON"]'), null);
  } finally { await act(async () => root.unmount()); (window as any).showSaveFilePicker = originalPicker; (globalThis as any).localStorage = originalStorage; window.confirm = originalConfirm; }
});

test('Loaded lab/reference names become draft names; lab configuration links can be recreated safely', async () => {
  const h = await mount(); const oldAlert = window.alert; const alerts: string[] = [];
  window.alert = message => { alerts.push(String(message)); };
  try {
    const reference = COURSE_LABS.flatMap(lab => lab.references).find(ref => ref.id === 'lab3-two-tier')!;
    await h.act(() => h.api().openLabReference(reference));
    assert.equal(h.api().draftName, reference.title);
    const ec2 = h.api().nodes.find(n => n.data.serviceId === 'ec2')!;
    const ebs = h.api().nodes.find(n => n.data.serviceId === 'ebs')!;
    await h.act(() => h.api().setEdges(previous => previous.filter(e => !(e.source === ec2.id && e.target === ebs.id))));
    await h.act(() => h.api().onConnect({ source: ec2.id, target: ebs.id, sourceHandle: null, targetHandle: null }));
    const edge = h.api().edges.find(e => e.source === ec2.id && e.target === ebs.id)!;
    assert.ok(edge); assert.equal(edge.data?.relationship, 'manages'); assert.equal(edge.data?.referenceAnnotation, reference.id);
    assert.deepEqual(alerts, []);
    await h.act(() => h.api().updateEdgeData(edge.id, { relationship: 'request' }));
    assert.equal(h.api().edges.find(e => e.id === edge.id)!.data?.relationship, 'manages');
    const { REFERENCE_ARCHITECTURES } = await import('../../src/data/referenceArchitectures.ts');
    await h.act(() => h.api().loadTemplate(REFERENCE_ARCHITECTURES[0].id));
    assert.equal(h.api().draftName, REFERENCE_ARCHITECTURES[0].name);
    assert.equal(JSON.parse(h.api().exportDraft()).state.draftName, REFERENCE_ARCHITECTURES[0].name);
  } finally { window.alert = oldAlert; await h.unmount(); }
});

test('Lab 1 user IAM links illustrate authorization without replacing the S3 request or granting access', async () => {
  const h = await mount(); const oldAlert = window.alert; const alerts: string[] = []; window.alert = message => { alerts.push(String(message)); };
  try {
    const reference = COURSE_LABS.flatMap(lab => lab.references).find(ref => ref.id === 'lab1-allow')!;
    await h.act(() => h.api().openLabReference(reference));
    await h.act(() => h.api().onConnect({ source: 'lab-user', target: 'lab-iam', sourceHandle: null, targetHandle: null }));
    const edge = h.api().edges.find(e => e.source === 'lab-user' && e.target === 'lab-iam')!;
    assert.ok(edge); assert.equal(edge.data?.relationship, 'authorization');
    assert.deepEqual(alerts, []);
    await h.act(() => h.api().runScenario());
    assert.equal(h.api().simulationResult!.success, true);
    assert.equal(h.api().draftName, reference.title);
    const denied = COURSE_LABS.flatMap(lab => lab.references).find(ref => ref.id === 'lab1-deny')!;
    await h.act(() => h.api().openLabReference(denied));
    await h.act(() => h.api().onConnect({ source: 'lab-user', target: 'lab-iam', sourceHandle: null, targetHandle: null }));
    await h.act(() => h.api().runScenario());
    assert.equal(h.api().simulationResult!.success, false, 'An authorization illustration must never grant access');
  } finally { window.alert = oldAlert; await h.unmount(); }
});

test('EKS explorer opens explicitly, nests pod containers, persists readiness and preserves other configuration', async () => {
  const h = await mount(true);
  try {
    await h.act(() => h.api().addServiceNode('eks', { x: 0, y: 0 }));
    const eks = h.api().nodes.filter(n => n.data.serviceId === 'eks').at(-1)!;
    await h.act(() => h.api().updateNodeData(eks.id, { subnet: 'private', customConfig: { sentinel: 'keep', eks: { kind: 'workload', clusterName: 'learning', namespace: 'web', runningPods: 2, readyPods: 1 } } }));
    await h.act(() => h.api().setSelectedNodeId(eks.id));
    assert.equal(document.querySelector('[aria-label="EKS component details"]'), null);
    const button = (text: string) => [...document.querySelectorAll('button')].find(b => b.textContent?.includes(text))!;
    const opener = button('More information'); opener.focus();
    await h.act(() => opener.click());
    const cluster = document.querySelector('[aria-label="EKS cluster boundary"]')!;
    const namespace = cluster.querySelector('[aria-label="EKS namespace boundary: web"]')!;
    assert.ok(namespace.querySelector('[aria-label="EKS pod snapshot 1"] button'));
    assert.match(namespace.querySelector('[aria-label="EKS pod snapshot 1"]')!.textContent!, /Container/);
    await h.act(() => button('Deployment:').click());
    await h.act(() => button('Make all pods Not Ready').click());
    assert.equal(h.api().nodes.find(n => n.id === eks.id)!.data.customConfig!.eks.readyPods, 0);
    assert.equal(h.api().nodes.find(n => n.id === eks.id)!.data.customConfig!.sentinel, 'keep');
    assert.match(namespace.textContent!, /0 eligible endpoints/);
    await h.act(() => button('HPA ·').click());
    assert.equal((button('Apply estimate') as HTMLButtonElement).disabled, true);
    await h.act(() => document.querySelector('[role="dialog"]')!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(document.activeElement, opener);
  } finally { await h.unmount(); }
});

test('Home page opens the lab and routes real issue/comment links without a fake submission form', async () => {
  const { HomePage } = await import('../../src/components/home/HomePage.tsx');
  const root = createRoot(document.getElementById('root')!);
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({ ok: true, json: async () => [
    { login: 'CS-Sensei', type: 'User', avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4', contributions: 10 },
    { login: 'Copilot', type: 'Bot', avatar_url: 'https://avatars.githubusercontent.com/in/2?v=4', contributions: 1 },
    { login: 'Namgay282004', type: 'User', avatar_url: 'https://avatars.githubusercontent.com/u/3?v=4', contributions: 1 },
  ] })) as any;
  let started = 0;
  try {
    await act(async () => root.render(React.createElement(HomePage, { onStart: () => { started++; } })));
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    const start = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('Start exploring'))!;
    await act(async () => start.click());
    assert.equal(started, 1);
    for (const label of ['Report an issue', 'Leave a comment or idea']) {
      const link = [...document.querySelectorAll('a')].find(a => a.textContent?.includes(label))!;
      const url = new URL(link.href);
      assert.equal(url.origin, 'https://github.com');
      assert.equal(url.pathname, '/norbutlepcha25/cloud-architecture-lab/issues/new');
      assert.ok(url.searchParams.get('body'));
    }
    assert.equal(document.querySelector('form'), null);
    const guideRows = document.querySelectorAll('#guide tbody tr');
    assert.ok(guideRows.length >= 15, 'interface guide lists every area');
    assert.match(document.getElementById('save')!.textContent!, /Download JSON[\s\S]*Upload JSON[\s\S]*Save and resume a draft[\s\S]*Download the diagram as an image/);
    const docLinks = [...document.querySelectorAll<HTMLAnchorElement>('#aws-docs a[href^="https://"]')].filter(a => !a.href.includes('github.com'));
    assert.ok(docLinks.length >= 20);
    for (const a of docLinks) assert.match(new URL(a.href).hostname, /^(docs\.)?aws\.amazon\.com$|^docs\.aws\.amazon\.com$/);
    const natTab = [...document.querySelectorAll<HTMLButtonElement>('[role=tab]')].find(b => b.textContent === 'NAT gateway fails')!;
    await act(async () => natTab.click());
    assert.equal(natTab.getAttribute('aria-selected'), 'true');
    assert.match(document.getElementById('home-scenario-panel')!.textContent!, /PARTIAL OUTAGE/);
    assert.match(document.querySelector('.home-contributors')!.textContent!, /Namgay Wangchuk/);
    assert.doesNotMatch(document.querySelector('.home-contributors ul')!.textContent!, /bot|claude|codex|agent|copilot/i);
    const avatars = [...document.querySelectorAll<HTMLImageElement>('.home-contributors img')].map(img => img.src);
    assert.deepEqual(avatars, ['https://avatars.githubusercontent.com/u/1?v=4&s=112', 'https://avatars.githubusercontent.com/u/3?v=4&s=112']);
  } finally { globalThis.fetch = previousFetch; await act(async () => root.unmount()); }
});

test('EKS control-plane components have dedicated descriptions and editable management links', async () => {
  const { REFERENCE_ARCHITECTURES } = await import('../../src/data/referenceArchitectures.ts');
  const h = await mount(true);
  try {
    const ref = REFERENCE_ARCHITECTURES.find(r => r.id === 'eks-architecture')!;
    await h.act(() => { h.api().setNodes(structuredClone(ref.nodes)); h.api().setEdges([]); h.api().setSelectedNodeId('eks-scheduler'); });
    const panel = document.querySelector('[aria-label="EKS control-plane component details"]')!;
    assert.match(panel.textContent!, /AWS-managed control plane/);
    assert.match(panel.textContent!, /records node bindings/);
    assert.doesNotMatch(panel.textContent!, /Regional Virtual Network/);
    await h.act(() => h.api().onConnect({ source: 'eks-api', target: 'eks-scheduler', sourceHandle: 'source-right', targetHandle: 'target-left' }));
    assert.equal(h.api().edges.length, 1);
    assert.equal(h.api().edges[0].data!.relationship, 'manages');
    assert.equal(h.api().edges[0].data!.protocol, 'HTTPS');
    await h.act(() => h.api().onConnect({ source: 'eks-api', target: 'eks-vpc', sourceHandle: null, targetHandle: null }));
    assert.equal(h.api().edges.length, 1, 'ordinary network boundaries remain non-connectable');
    await h.act(() => h.api().onConnect({ source: 'eks-api', target: 'eks-scheduler', sourceHandle: 'source-right', targetHandle: 'target-left' }));
    assert.equal(h.api().edges.length, 1, 'duplicates ignored');
  } finally { await h.unmount(); }
});

test('Connection sides can be edited without losing settings, and persist through draft restore', async () => {
  const h = await mount(true);
  try {
    await h.act(() => h.api().setNodes(['app', 'db', 'other-db'].map(id => ({ id, type: 'serviceNode', position: { x: 0, y: 0 }, data: { serviceId: id === 'app' ? 'ec2' : 'rds', label: id, category: 'Compute', subnet: 'private', az: 'AZ-A', health: 'healthy' } })) as any));
    await h.act(() => h.api().onConnect({ source: 'app', target: 'db', sourceHandle: 'source-right', targetHandle: 'target-left' }));
    const id = h.api().edges[0].id;
    await h.act(() => { h.api().updateEdgeData(id, { label: 'Database query', stepNumber: 4 }); h.api().setSelectedEdgeId(id); });
    const before = structuredClone(h.api().edges[0]);
    const choose = async (label: string, value: string) => {
      const select = document.querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement;
      assert.ok(select);
      await h.act(() => { select.value = value; select.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
    };
    await choose('Source side', 'bottom'); await choose('Target side', 'top');
    const edited = h.api().edges[0];
    assert.equal(edited.id, before.id); assert.deepEqual(edited.data, before.data);
    assert.equal(edited.sourceHandle, 'bottom'); assert.equal(edited.targetHandle, 'top');
    const draft = h.api().exportDraft();
    await h.act(() => h.api().importDraft(draft));
    assert.equal(h.api().edges[0].sourceHandle, 'bottom'); assert.equal(h.api().edges[0].targetHandle, 'top');
    const restoredData = structuredClone(h.api().edges[0].data);
    await h.act(() => h.api().onReconnect(h.api().edges[0], { source: 'app', target: 'other-db', sourceHandle: 'source-left', targetHandle: 'target-right' }));
    assert.equal(h.api().edges[0].id, id); assert.equal(h.api().edges[0].target, 'other-db');
    assert.deepEqual(h.api().edges[0].data, restoredData);
  } finally { await h.unmount(); }
});

test('Reconnection rejects incompatible resources and self loops while preserving EKS annotation side edits', async () => {
  const h = await mount(); const oldAlert = window.alert; window.alert = () => {};
  try {
    const { REFERENCE_ARCHITECTURES } = await import('../../src/data/referenceArchitectures.ts');
    const ref = REFERENCE_ARCHITECTURES.find(r => r.id === 'eks-architecture')!;
    await h.act(() => { h.api().setNodes(structuredClone(ref.nodes)); h.api().setEdges(structuredClone(ref.edges)); });
    const original = h.api().edges.find(e => e.target === 'eks-pod-a1')!;
    await h.act(() => h.api().onReconnect(original, { source: original.source, target: original.target, sourceHandle: 'source-bottom', targetHandle: 'target-top' }));
    assert.equal(h.api().edges.find(e => e.id === original.id)!.targetHandle, 'target-top');
    const before = structuredClone(h.api().edges);
    await h.act(() => h.api().onReconnect(original, { source: original.source, target: 'eks-vpc', sourceHandle: 'source-bottom', targetHandle: 'target-top' }));
    assert.deepEqual(h.api().edges, before);
    await h.act(() => h.api().onReconnect(original, { source: original.source, target: original.source, sourceHandle: null, targetHandle: null }));
    assert.deepEqual(h.api().edges, before);
  } finally { window.alert = oldAlert; await h.unmount(); }
});


test('Compass connections expose exactly eight shared dots and resolve legacy saved handles', async () => {
  const { CompassHandles } = await import('../../src/components/canvas/CompassHandles.tsx');
  const { compassHandleId } = await import('../../src/utils/compassHandles.ts');
  const { ReactFlowProvider } = await import('@xyflow/react');
  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(ReactFlowProvider, null, React.createElement(CompassHandles))); });
  const dots = [...container.querySelectorAll('.react-flow__handle')];
  await act(async () => { root.unmount(); });
  assert.equal(dots.length, 8);
  assert.ok(dots.every(dot => dot.classList.contains('compass-handle') && dot.querySelector('svg[aria-hidden="true"] path')), 'Every shared dot carries a move glyph without adding connection handles');
  assert.deepEqual(dots.map(dot => dot.getAttribute('data-handleid')), ['top', 'top-right', 'right', 'bottom-right', 'bottom', 'bottom-left', 'left', 'top-left']);
  for (const side of ['top', 'right', 'bottom', 'left']) {
    assert.equal(compassHandleId(`source-${side}`, 'source'), side);
    assert.equal(compassHandleId(`target-${side}`, 'target'), side);
  }
  assert.equal(compassHandleId('top-right', 'target'), 'top-right');
  assert.equal(compassHandleId(null, 'source'), 'right');
  assert.equal(compassHandleId(null, 'target'), 'left');
});

test('Canvas lab save appears only for loaded labs and exports live edits with lab metadata', async () => {
  const { SaveLabDiagram } = await import('../../src/components/labs/SaveLabDiagram.tsx');
  const originalPicker = (window as any).showSaveFilePicker;
  let saved = ''; let filename = '';
  (window as any).showSaveFilePicker = async (options: any) => {
    filename = options.suggestedName;
    return { createWritable: async () => ({ write: async (text: string) => { saved = text; }, close: async () => {} }) };
  };
  const root = createRoot(document.getElementById('root')!);
  const apiRef: { current: Api | null } = { current: null };
  try {
    await act(async () => root.render(React.createElement(ArchitectureProvider, null, React.createElement(Harness, { apiRef }), React.createElement(SaveLabDiagram))));
    assert.equal(document.querySelector('button'), null);
    const lab = COURSE_LABS.find(item => item.references.some(ref => ref.configurationChecks))!;
    const reference = lab.references.find(ref => ref.configurationChecks)!;
    await act(async () => apiRef.current!.openLabReference(reference));
    assert.equal(document.querySelector('button')!.textContent, 'Save lab diagram');
    await act(async () => {
      apiRef.current!.setNodes(previous => previous.map((node, index) => index === 0 ? { ...node, position: { x: 321, y: 654 }, data: { ...node.data, label: 'Edited lab component' } } : node));
      apiRef.current!.setEdges(previous => previous.map(edge => ({ ...edge, sourceHandle: 'bottom-right', targetHandle: 'top-left' })));
      apiRef.current!.setScenario(previous => ({ ...previous, startNodeId: 'removed-start', path: '/edited' }));
    });
    await act(async () => document.querySelector('button')!.click());
    const exported = JSON.parse(saved);
    assert.equal(filename, `${String(lab.number).padStart(2, '0')}-${reference.id}.json`);
    assert.equal(exported.id, reference.id);
    assert.equal(exported.expected, reference.expected);
    assert.equal(exported.description, reference.description);
    assert.deepEqual(exported.configurationChecks, reference.configurationChecks);
    assert.deepEqual(exported.nodes[0].position, { x: 321, y: 654 });
    assert.equal(exported.nodes[0].data.label, 'Edited lab component');
    assert.deepEqual(exported.edges, JSON.parse(JSON.stringify(apiRef.current!.edges)));
    assert.equal(exported.scenario.startNodeId, '');
    assert.equal(exported.scenario.path, '/edited');
    const authorizationRef = COURSE_LABS.flatMap(item => item.references).find(ref => ref.authorization)!;
    await act(async () => apiRef.current!.openLabReference(authorizationRef));
    await act(async () => document.querySelector('button')!.click());
    assert.deepEqual(JSON.parse(saved).authorization, authorizationRef.authorization);
    await act(async () => apiRef.current!.loadTemplate('eks-architecture'));
    assert.equal(document.querySelector('button'), null);
  } finally {
    await act(async () => root.unmount());
    (window as any).showSaveFilePicker = originalPicker;
  }
});

test('Real UI analytics sends one screen event under StrictMode and tracks lab simulations without graph data', async () => {
  const { initializeAnalytics } = await import('../../src/analytics/analytics.ts');
  const { AnalyticsObserver } = await import('../../src/analytics/AnalyticsObserver.tsx');
  const savedEvent = Object.getOwnPropertyDescriptor(globalThis, 'Event');
  const savedStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const savedUmami = (window as any).umami;
  Object.defineProperty(globalThis, 'Event', { value: dom.window.Event, configurable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: dom.window.localStorage, configurable: true });
  localStorage.removeItem('umami.disabled');
  const sent: { event: string; data: any }[] = [];
  (window as any).umami = { track: (event: string, data: any) => { sent.push({ event, data }); } };
  const stop = initializeAnalytics({ production: true, websiteId: 'test-ui', scriptUrl: 'https://analytics.example/script.js', domains: 'localhost' });
  const root = createRoot(document.getElementById('root')!);
  const apiRef: { current: Api | null } = { current: null };
  try {
    await act(async () => root.render(React.createElement(React.StrictMode, null, React.createElement(ArchitectureProvider, null, React.createElement(Harness, { apiRef }), React.createElement(AnalyticsObserver, { page: 'lab' })))));
    assert.equal(sent.filter(item => item.event === 'screen_view').length, 1);
    const reference = COURSE_LABS[0].references[0];
    await act(async () => apiRef.current!.openLabReference(reference));
    await act(async () => apiRef.current!.runScenario());
    assert.equal(sent.filter(item => item.event === 'lab_opened').length, 1);
    const simulation = sent.find(item => item.event === 'simulation_run')!;
    assert.equal(simulation.data.lab_id, reference.id);
    assert.equal(typeof simulation.data.success, 'boolean');
    assert.equal(simulation.data.nodes, undefined);
    assert.equal(simulation.data.scenario, undefined);
    assert.equal(simulation.data.path, undefined);
    assert.equal(simulation.data.name, undefined);
  } finally {
    await act(async () => root.unmount()); stop();
    (window as any).umami = savedUmami;
    if (savedEvent) Object.defineProperty(globalThis, 'Event', savedEvent); else delete (globalThis as any).Event;
    if (savedStorage) Object.defineProperty(globalThis, 'localStorage', savedStorage); else delete (globalThis as any).localStorage;
  }
});

test('Recorded check results keep their scope in controls and trace after execution', async () => {
  const h = await mount(false, false, true);
  try {
    const ref = COURSE_LABS.find(lab => lab.number === 10)!.references[0];
    await h.act(() => h.api().openLabReference(ref));
    await h.act(() => h.api().runScenario());
    assert.equal(h.api().simulationResult!.kind, 'configuration-check');
    assert.equal(h.api().requestTrace!.kind, 'configuration-check');
    assert.ok(document.body.textContent!.includes('Configuration PASS'));
    assert.ok(!document.body.textContent!.includes('HTTP 200'));
    await h.act(() => h.api().setIsPlaying(false));
    // A check failure is not an authorization denial.
    const check = ref.configurationChecks![0];
    await h.act(() => h.api().setNodes(nodes => nodes.filter(node => node.id !== check.nodeId)));
    await h.act(() => h.api().runScenario());
    assert.equal(h.api().requestTrace!.final, 'FAILURE');
    assert.ok(document.body.textContent!.includes('Configuration FAIL'));
  } finally { await h.unmount(); }
});

test('Real provider executes equivalent lab and new-design inputs through the same behavior', async () => {
  const h = await mount();
  try {
    const ref = COURSE_LABS[3].references[0];
    await h.act(() => h.api().openLabReference(ref));
    await h.act(() => h.api().runScenario());
    const fromLab = structuredClone(h.api().simulationResult!);
    await h.act(() => h.api().setIsPlaying(false));
    // loadTemplate clears the lab context and uses the ordinary design execution path.
    await h.act(() => h.api().loadTemplate('equivalent-design', {
      id: 'equivalent-design', name: 'Equivalent design', category: 'Test', difficulty: 'Beginner',
      description: '', learningOutcome: '', nodes: structuredClone(ref.nodes),
      edges: structuredClone(ref.edges), scenario: ref.scenario
    }));
    assert.equal(h.api().activeLabReference, null);
    await h.act(() => h.api().runScenario());
    const direct = h.api().simulationResult!;
    assert.deepEqual({ ...fromLab, summary: direct.summary }, direct);
  } finally { await h.unmount(); }
});

test('Connection inspector exposes destination port; invalid edits are rejected and valid values persist', async () => {
  const h = await mount(true);
  const previousAlert = window.alert;
  const alerts: string[] = [];
  window.alert = message => { alerts.push(String(message)); };
  try {
    await h.act(() => {
      h.api().setNodes(['source', 'target'].map(id => ({ id, type: 'serviceNode', position: { x: id === 'source' ? 0 : 400, y: 0 }, data: { serviceId: 'ec2', label: id, health: 'healthy', subnet: 'private' } })) as any);
      h.api().setEdges([{ id: 'port-edge', source: 'source', target: 'target', data: { protocol: 'TCP' } }] as any);
      h.api().setSelectedNodeId(null);
      h.api().setSelectedEdgeId('port-edge');
    });
    assert.ok(document.querySelector('input[aria-label="Destination port"]'));
    await h.act(() => h.api().updateEdgeData('port-edge', { destinationPort: 5432 }));
    assert.equal((document.querySelector('input[aria-label="Destination port"]') as HTMLInputElement).value, '5432');
    await h.act(() => h.api().updateEdgeData('port-edge', { destinationPort: 65536 }));
    assert.equal(h.api().edges[0].data!.destinationPort, 5432);
    assert.match(alerts.at(-1)!, /Destination port/);
    const saved = h.api().exportDraft();
    await h.act(() => h.api().importDraft(saved));
    assert.equal(h.api().edges[0].data!.destinationPort, 5432);
  } finally { window.alert = previousAlert; await h.unmount(); }
});

test('Reference loader uses the same deterministic entry-point default as request execution', async () => {
  const h = await mount();
  try {
    const nodes: any[] = ['z-client', 'a-client'].map(id => ({ id, type: 'serviceNode', position: { x: 0, y: 0 }, data: { serviceId: 'user', label: id, health: 'healthy', subnet: 'global' } }));
    const ref = { id: 'ordered-default', name: 'Default', description: '', learningOutcome: '', category: 'Test', difficulty: 'Beginner' as const, nodes, edges: [] };
    for (const ordered of [nodes, [...nodes].reverse()]) {
      await h.act(() => h.api().loadTemplate(ref.id, { ...ref, nodes: ordered }));
      assert.equal(h.api().scenario.startNodeId, 'a-client');
      await h.act(() => h.api().runScenario());
      assert.equal(h.api().simulationResult!.path[0], 'a-client');
    }
  } finally { await h.unmount(); }
});

test('Overview and Config remain tabs while service sections collapse and reset on selection', async () => {
  const h = await mount(true);
  const toggle = (title: string) => [...document.querySelectorAll<HTMLButtonElement>('aside button[aria-expanded]')].find(button => button.textContent?.trim() === title)!;
  const body = (button: HTMLButtonElement) => document.getElementById(button.getAttribute('aria-controls')!)!;
  try {
    await h.act(() => h.api().addServiceNode('ec2', { x: 0, y: 0 }));
    const config = document.querySelector<HTMLButtonElement>('[role=tab][id=inspector-config-tab]')!;
    assert.equal(config.getAttribute('aria-selected'), 'false');
    assert.equal(document.getElementById('inspector-overview-panel')!.hidden, false);
    await h.act(() => config.click());
    assert.equal(config.getAttribute('aria-selected'), 'true');
    assert.equal(document.getElementById('inspector-config-panel')!.hidden, false);
    assert.equal(document.getElementById('inspector-overview-panel')!.hidden, true);
    assert.equal(toggle('Teaching Notes').getAttribute('aria-expanded'), 'false');
    const instance = toggle('EC2 instance configuration');
    assert.ok(instance);
    assert.equal(body(instance).hidden, true);
    await h.act(() => instance.click());
    assert.equal(body(instance).hidden, false);
    assert.ok(body(instance).textContent?.includes('Instance Type / Size'));
    await h.act(() => instance.click());
    assert.equal(body(instance).hidden, true);
    await h.act(() => h.api().addServiceNode('s3', { x: 600, y: 600 }));
    assert.equal(document.querySelector('[id=inspector-config-tab]')!.getAttribute('aria-selected'), 'true');
    assert.ok(toggle('S3 bucket configuration'));
    assert.ok(!toggle('EC2 instance configuration'));
    assert.ok(!toggle('Availability zone'));
    assert.ok(!toggle('Subnet placement'));
    assert.ok(!toggle('RDS availability'));
    assert.ok(!document.body.textContent?.includes('Task / Instance Replicas'));
  } finally { await h.unmount(); }
});

test('Inspector shows service-owned settings and preserves edits through accordion toggles', async () => {
  const h = await mount(true);
  const toggle = (title: string) => [...document.querySelectorAll<HTMLButtonElement>('aside button[aria-expanded]')].find(button => button.textContent?.trim() === title)!;
  try {
    await h.act(() => h.api().addServiceNode('rds', { x: 0, y: 0 }));
    assert.ok(toggle('Database configuration'));
    assert.ok(toggle('RDS availability'));
    assert.ok(!toggle('Lambda function configuration'));
    await h.act(() => h.api().addServiceNode('lambda', { x: 0, y: 0 }));
    assert.ok(toggle('Lambda function configuration'));
    assert.ok(!toggle('RDS availability'));
    assert.ok(!toggle('Availability zone'));
    await h.act(() => h.api().addServiceNode('ecs', { x: 0, y: 0 }));
    assert.ok(toggle('ECS service configuration'));
    assert.ok(!toggle('EC2 instance configuration'));
    await h.act(() => h.api().addServiceNode('eks', { x: 0, y: 0 }));
    const id = h.api().selectedNode!.id;
    await h.act(() => h.api().updateNodeData(id, { subnet: 'private', customConfig: { eks: { kind: 'workload', readyPods: 1, runningPods: 1 } } }));
    await h.act(() => document.querySelector<HTMLButtonElement>('[id=inspector-config-tab]')!.click());
    await h.act(() => toggle('EKS cluster and workload').click());
    const role = document.querySelector<HTMLSelectElement>('[aria-label="EKS resource role"]')!;
    assert.equal(role.value, 'workload');
    const selector = document.querySelector<HTMLInputElement>('[aria-label="Service selector"]')!;
    // Drive React's real input change event rather than writing context directly.
    await h.act(() => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(selector, 'updated-app');
      selector.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
    assert.equal(h.api().selectedNode!.data.customConfig!.eks.serviceSelector, 'updated-app');
    await h.act(() => toggle('EKS cluster and workload').click());
    await h.act(() => toggle('EKS cluster and workload').click());
    assert.equal(document.querySelector<HTMLInputElement>('[aria-label="Service selector"]')!.value, 'updated-app');
    await h.act(() => h.api().updateNodeData(id, { customConfig: { eks: { kind: 'control-plane' } } }));
    assert.ok(!toggle('Network identity'));
    assert.ok(!toggle('Security groups'));
    assert.equal(document.querySelector('[aria-label="Observed Ready pods"]'), null);
  } finally { await h.unmount(); }
});

test('Metadata-only services expose no invented capacity settings; connections and boundaries collapse independently', async () => {
  const h = await mount(true);
  const toggle = (title: string) => [...document.querySelectorAll<HTMLButtonElement>('aside button[aria-expanded]')].find(button => button.textContent?.trim() === title)!;
  try {
    await h.act(() => h.api().addServiceNode('backup', { x: 0, y: 0 }));
    assert.match(document.body.textContent!, /No service-specific configuration panel/);
    assert.ok(!toggle('RDS availability'));
    assert.ok(!toggle('Availability zone'));
    await h.act(() => h.api().addBoundaryNode('private_subnet', { x: 0, y: 0 }));
    const boundary = [...document.querySelectorAll<HTMLButtonElement>('aside button[aria-expanded]')][0];
    assert.equal(boundary.getAttribute('aria-expanded'), 'false');
    await h.act(() => boundary.click());
    assert.equal(boundary.getAttribute('aria-expanded'), 'true');
    await h.act(() => {
      h.api().setNodes(['a', 'b'].map(id => ({ id, position: { x: 0, y: 0 }, data: { serviceId: 'ec2', label: id, health: 'healthy', subnet: 'private' } })) as any);
      h.api().setEdges([{ id: 'link', source: 'a', target: 'b', data: { protocol: 'TCP' } }] as any);
      h.api().setSelectedNodeId(null); h.api().setSelectedEdgeId('link');
    });
    assert.equal(toggle('Connection settings').getAttribute('aria-expanded'), 'false');
    await h.act(() => toggle('Connection settings').click());
    assert.ok(document.querySelector('[aria-label="Destination port"]'));
  } finally { await h.unmount(); }
});
