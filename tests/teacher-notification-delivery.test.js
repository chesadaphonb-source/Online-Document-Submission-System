import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Exercise the real NotificationProvider. Only connected services, login profile,
// and toast presentation are replaced. No environment or HTTP is accessed.
const output = new URL('../tmp/teacher-notification-delivery/', import.meta.url);
await mkdir(output, { recursive: true });
const outfile = new URL(`provider-${process.pid}.mjs`, output);
await build({
  entryPoints: [fileURLToPath(new URL('../src/app/context/NotificationContext.tsx', import.meta.url))],
  outfile: fileURLToPath(outfile), bundle: true, platform: 'node', format: 'esm',
  packages: 'external', jsx: 'automatic', logLevel: 'silent',
  plugins: [{ name: 'teacher-delivery-services', setup(builder) {
    builder.onResolve({ filter: /(?:^|\/)lib\/supabase$/ }, () => ({ path: 'database', namespace: 'delivery-fixture' }));
    builder.onResolve({ filter: /(?:^|\/)AuthContext$/ }, () => ({ path: 'auth', namespace: 'delivery-fixture' }));
    builder.onResolve({ filter: /(?:^|\/)SystemContext$/ }, () => ({ path: 'system', namespace: 'delivery-fixture' }));
    builder.onResolve({ filter: /^sonner$/ }, () => ({ path: 'toast', namespace: 'delivery-fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'delivery-fixture' }, ({ path }) => ({ contents:
      path === 'database' ? 'export const supabase=globalThis.__teacherDelivery.client; export const isSupabaseConfigured=true;'
      : path === 'auth' ? 'export function useAuth(){return {currentUser:globalThis.__teacherDelivery.currentUser};}'
      : path === 'system' ? 'export const SUPER_ADMIN_EMAILS=["master@example.invalid"];'
      : 'export const toast={error:(...args)=>globalThis.__teacherDelivery.toasts.push(args)};',
    }));
  } }],
});

const users = Object.freeze([
  Object.freeze({ id: 'teacher-one', email: 'teacher-one@example.invalid', role: 'teacher', department: 'Department A' }),
  Object.freeze({ id: 'teacher-two', email: 'teacher-two@example.invalid', role: 'teacher', department: 'Department B' }),
  Object.freeze({ id: 'master', email: 'master@example.invalid', role: 'admin', department: '' }),
]);
const fixture = {
  currentUser: { id: 'admin-sender', email: 'admin-sender@example.invalid', role: 'admin' },
  requests: [], inserts: [], toasts: [], logs: [], lookupFailures: new Set(), lookupWaits: new Map(), failAdminLookup: false,
};
const reply = (status = 200) => new Response(JSON.stringify({ success: status < 400 }), {
  status, headers: { 'Content-Type': 'application/json' },
});

function queryFor(table) {
  const filters = [];
  const result = (single = false) => {
    if (table === 'notifications') return { data: [], error: null };
    const id = filters.find(([field]) => field === 'id')?.[1];
    const role = filters.find(([field]) => field === 'role')?.[1];
    if (fixture.lookupFailures.has(id) || (role === 'admin' && fixture.failAdminLookup)) {
      return { data: null, error: { code: '42501', message: 'Synthetic lookup denied' } };
    }
    const rows = users.filter(user => (!id || user.id === id) && (!role || user.role === role));
    return { data: single ? rows[0] || null : rows, error: null };
  };
  const query = {
    select() { return query; }, eq(field, value) { filters.push([field, value]); return query; },
    or() { return query; }, order() { return query; }, limit() { return query; },
    then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
    async maybeSingle() {
      const id = filters.find(([field]) => field === 'id')?.[1];
      return fixture.lookupWaits.has(id) ? fixture.lookupWaits.get(id) : result(true);
    },
    async insert(rows) {
      assert.equal(table, 'notifications');
      fixture.inserts.push(structuredClone(rows));
      return { error: null };
    },
    update() { assert.fail('delivery must not modify user accounts or read status'); },
    delete() { assert.fail('delivery must not delete rows'); },
  };
  return query;
}
fixture.client = {
  from(table) { assert.ok(['users', 'notifications'].includes(table)); return queryFor(table); },
  channel() { const channel = { on() { return channel; }, subscribe() { return channel; } }; return channel; },
  removeChannel() {},
};
globalThis.__teacherDelivery = fixture;
const { NotificationProvider, useNotifications } = await import(outfile.href);

async function mount(hostname = 'ku-envipaper.vercel.app') {
  fixture.requests = []; fixture.inserts = []; fixture.toasts = []; fixture.logs = [];
  fixture.lookupFailures = new Set(); fixture.lookupWaits = new Map(); fixture.failAdminLookup = false;
  fixture.respond = async () => reply();
  const saved = { window: globalThis.window, fetch: globalThis.fetch,
    log: console.log, warn: console.warn, error: console.error };
  globalThis.window = { location: { hostname } };
  globalThis.fetch = async (url, options = {}) => {
    assert.ok(url === '/api/send-email' || url === '/api/notify-chat', 'unexpected remote URL');
    const request = { url, body: JSON.parse(options.body), method: options.method, signal: options.signal, keepalive: options.keepalive };
    fixture.requests.push(request);
    return fixture.respond(request);
  };
  for (const method of ['log', 'warn', 'error']) console[method] = (...args) => fixture.logs.push({ method, args });
  let context;
  function Probe() { context = useNotifications(); return null; }
  let renderer;
  await act(async () => { renderer = TestRenderer.create(createElement(NotificationProvider, null, createElement(Probe))); });
  return {
    get context() { return context; },
    async dispose() {
      await act(async () => renderer.unmount());
      saved.window === undefined ? delete globalThis.window : globalThis.window = saved.window;
      globalThis.fetch = saved.fetch;
      for (const method of ['log', 'warn', 'error']) console[method] = saved[method];
    },
  };
}

function teacherEvent(recipientId = 'teacher-one', submissionId = 'request-one') {
  return { recipientId, submissionId, submissionName: 'Synthetic petition', type: 'forwarded_to_teacher',
    title: 'Synthetic teacher notification', message: 'Synthetic details only',
    actionUrl: '/teacher/approvals', department: 'Department A', studentEmail: 'student@example.invalid' };
}
const emailRequests = () => fixture.requests.filter(request => request.url === '/api/send-email');
const chatRequests = () => fixture.requests.filter(request => request.url === '/api/notify-chat');
const nextTurn = () => new Promise(resolve => setImmediate(resolve));
const send = (ui, mode, event) => mode === 'single'
  ? ui.context.addNotification(event) : ui.context.addNotifications([event]);

for (const mode of ['single', 'batch']) {
  test(`${mode}: email starts while Chat remains unresolved`, async () => {
    const ui = await mount();
    let releaseChat;
    let delivery;
    fixture.respond = request => request.url === '/api/notify-chat'
      ? new Promise(resolve => { releaseChat = () => resolve(reply()); }) : Promise.resolve(reply());
    try {
      await act(async () => { delivery = send(ui, mode, teacherEvent()); await nextTurn(); });
      assert.equal(chatRequests().length, 1);
      assert.equal(emailRequests().length, 1, 'email must not wait for the Chat response');
      assert.deepEqual(emailRequests()[0].body.to, ['teacher-one@example.invalid']);
      assert.equal(emailRequests()[0].body.submissionId, 'request-one');
      assert.ok(fixture.requests.every(request => request.signal instanceof AbortSignal), 'each delivery needs a cancellable request');
      releaseChat();
      await act(async () => { await delivery; });
      assert.equal(fixture.toasts.length, 0);
    } finally {
      releaseChat?.();
      if (delivery) await act(async () => { await delivery; });
      await ui.dispose();
    }
  });

  test(`${mode}: a rejected Chat request does not suppress teacher email`, async () => {
    const ui = await mount();
    fixture.respond = async request => {
      if (request.url === '/api/notify-chat') throw new Error('Synthetic Chat network failure');
      return reply();
    };
    try {
      await act(async () => { await send(ui, mode, teacherEvent()); });
      assert.equal(emailRequests().length, 1);
      assert.deepEqual(emailRequests()[0].body.to, ['teacher-one@example.invalid']);
      assert.equal(chatRequests().length, 1);
      assert.equal(fixture.toasts.length, 0, 'successful email must not show an email warning for Chat failure');
    } finally { await ui.dispose(); }
  });

  test(`${mode}: HTTP 500 is checked without retry, with one warning only for email failure`, async () => {
    for (const failingChannel of ['email', 'chat', 'both']) {
      const ui = await mount();
      fixture.respond = async request => reply(failingChannel === 'both'
        || (failingChannel === 'email' && request.url === '/api/send-email')
        || (failingChannel === 'chat' && request.url === '/api/notify-chat') ? 500 : 200);
      try {
        await act(async () => { await send(ui, mode, teacherEvent()); await nextTurn(); });
        assert.equal(emailRequests().length, 1, `no mail retry when ${failingChannel} fails`);
        assert.equal(chatRequests().length, 1, `no Chat retry when ${failingChannel} fails`);
        assert.equal(fixture.toasts.length, failingChannel === 'chat' ? 0 : 1, `email warning when ${failingChannel} fails`);
        if (failingChannel !== 'email') assert.ok(fixture.logs.some(log => log.method === 'warn'), 'Chat HTTP failure must be logged');
        if (fixture.toasts.length) {
          assert.equal(typeof fixture.toasts[0][0], 'string');
          assert.ok(fixture.toasts[0][0].length > 0);
        }
        assert.equal(ui.context.notifications.length, 1, 'in-app notification remains available');
      } finally { await ui.dispose(); }
    }
  });

  test(`${mode}: teacher and admin lookup failures never redirect their email to the student`, async () => {
    for (const recipientId of ['teacher-one', 'role:admin']) {
      const ui = await mount();
      fixture.lookupFailures.add('teacher-one'); fixture.failAdminLookup = true;
      try {
        await act(async () => { await send(ui, mode, teacherEvent(recipientId)); });
        assert.equal(emailRequests().length, 0);
        assert.equal(fixture.toasts.length, 1);
        assert.equal(ui.context.notifications[0].recipientId, recipientId);
      } finally { await ui.dispose(); }
    }
  });

  test(`${mode}: guest student fallback still sends the student's own tracking notification`, async () => {
    const ui = await mount();
    try {
      const event = { ...teacherEvent('student_guest-fixture'), type: 'status_update', actionUrl: '/student/track' };
      await act(async () => { await send(ui, mode, event); });
      assert.equal(emailRequests().length, 1);
      assert.deepEqual(emailRequests()[0].body.to, ['student@example.invalid']);
      assert.equal(emailRequests()[0].body.submissionId, event.submissionId);
      assert.equal(fixture.toasts.length, 0);
    } finally { await ui.dispose(); }
  });

  test(`${mode}: student fallback rejects invalid addresses and nonstudent destinations`, async () => {
    for (const overrides of [
      { studentEmail: 'not-an-address' },
      { studentEmail: 'student@@example.invalid' },
      { studentEmail: 'student@example.invalid\nother@example.invalid' },
      { actionUrl: '/teacher/approvals' },
      { recipientId: 'unknown-user' },
    ]) {
      const ui = await mount();
      try {
        const event = { ...teacherEvent('student_guest-fixture'), type: 'status_update', actionUrl: '/student/track', ...overrides };
        await act(async () => { await send(ui, mode, event); });
        assert.equal(emailRequests().length, 0);
        assert.equal(fixture.toasts.length, 1);
      } finally { await ui.dispose(); }
    }
  });
}

test('opening the app loads in-app notifications without sending email or Chat', async () => {
  const ui = await mount();
  try {
    await act(async () => { await nextTurn(); });
    assert.equal(fixture.requests.length, 0);
    assert.equal(fixture.inserts.length, 0);
    assert.equal(fixture.toasts.length, 0);
  } finally { await ui.dispose(); }
});

test('staging keeps single and batch in-app notifications but sends no external requests', async () => {
  const ui = await mount('synthetic-staging.example.invalid');
  try {
    await act(async () => { await ui.context.addNotification(teacherEvent()); });
    await act(async () => { await ui.context.addNotifications([teacherEvent('teacher-two', 'request-two')]); });
    assert.equal(fixture.requests.length, 0);
    assert.equal(fixture.inserts.length, 2);
    assert.equal(ui.context.notifications.length, 2);
    assert.equal(fixture.toasts.length, 0);
  } finally { await ui.dispose(); }
});

test('a failed batch email job does not prevent another recipient job from completing', async () => {
  const ui = await mount();
  const accepted = [];
  fixture.respond = async request => {
    if (request.url === '/api/send-email') {
      if (request.body.to.includes('teacher-one@example.invalid')) throw new Error('Synthetic first mail failure');
      accepted.push(request.body.to);
    }
    return reply();
  };
  try {
    await act(async () => { await ui.context.addNotifications([teacherEvent(), teacherEvent('teacher-two', 'request-two')]); });
    assert.equal(emailRequests().length, 2);
    assert.deepEqual(accepted, [['teacher-two@example.invalid']]);
    assert.deepEqual(emailRequests().map(request => request.body.submissionId).sort(), ['request-one', 'request-two']);
    assert.equal(chatRequests().length, 1);
    assert.equal(fixture.toasts.length, 1);
    assert.equal(ui.context.notifications.length, 2);
  } finally { await ui.dispose(); }
});

for (const [channel, deadlineMs] of [['chat', 5_000], ['email', 20_000]]) {
  test(`${channel} deadline aborts its fetch without retrying or blocking the other channel`, async t => {
    const ui = await mount();
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let delivery;
    fixture.respond = request => {
      const isSlow = channel === 'chat' ? request.url === '/api/notify-chat' : request.url === '/api/send-email';
      if (!isSlow) return Promise.resolve(reply());
      return new Promise((_resolve, reject) => {
        assert.ok(request.signal instanceof AbortSignal);
        request.signal.addEventListener('abort', () => reject(new DOMException('Synthetic timeout', 'AbortError')), { once: true });
      });
    };
    try {
      await act(async () => { delivery = ui.context.addNotifications([teacherEvent()]); await nextTurn(); });
      assert.equal(emailRequests().length, 1);
      assert.equal(chatRequests().length, 1);
      const slowRequest = channel === 'chat' ? chatRequests()[0] : emailRequests()[0];
      t.mock.timers.tick(deadlineMs - 1);
      assert.equal(slowRequest.signal.aborted, false, 'the request must remain live before its deadline');
      t.mock.timers.tick(1);
      await act(async () => { await delivery; });
      assert.equal(slowRequest.signal.aborted, true);
      assert.equal(emailRequests().length, 1, 'an uncertain mail result must not be retried');
      assert.equal(chatRequests().length, 1);
      assert.equal(fixture.toasts.length, channel === 'email' ? 1 : 0);
      if (channel === 'chat') assert.ok(fixture.logs.some(log => log.method === 'warn'));
    } finally {
      t.mock.timers.runAll();
      if (delivery) await act(async () => { await delivery; });
      t.mock.timers.reset();
      await ui.dispose();
    }
  });
}

test('oversized delivery bodies use ordinary fetch instead of the browser keepalive quota', async () => {
  const ui = await mount();
  try {
    await act(async () => { await ui.context.addNotification({ ...teacherEvent(), message: 'x'.repeat(65_000) }); });
    assert.equal(fixture.requests.length, 2);
    assert.ok(fixture.requests.every(request => request.keepalive === false));
    assert.equal(fixture.toasts.length, 0);
    fixture.requests = [];
    await act(async () => { await ui.context.addNotification(teacherEvent()); });
    assert.ok(fixture.requests.every(request => request.keepalive === true), 'small requests remain eligible after the large delivery');
  } finally { await ui.dispose(); }
});

test('a stalled recipient lookup times out once and a late result never starts email', async t => {
  const ui = await mount();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let releaseLookup;
  let delivery;
  fixture.lookupWaits.set('teacher-one', new Promise(resolve => {
    releaseLookup = () => resolve({ data: users[0], error: null });
  }));
  try {
    await act(async () => { delivery = ui.context.addNotifications([teacherEvent()]); await nextTurn(); });
    assert.equal(chatRequests().length, 1, 'Chat proceeds while recipient lookup is stalled');
    assert.equal(emailRequests().length, 0);
    t.mock.timers.tick(9_999);
    assert.equal(fixture.toasts.length, 0);
    t.mock.timers.tick(1);
    await act(async () => { await delivery; });
    assert.equal(emailRequests().length, 0);
    assert.equal(fixture.toasts.length, 1);
    releaseLookup();
    await act(async () => { await nextTurn(); });
    assert.equal(emailRequests().length, 0, 'a timed-out lookup result must not trigger a delayed mail send');
    assert.equal(fixture.toasts.length, 1, 'the late result must not duplicate the warning');
  } finally {
    releaseLookup?.();
    t.mock.timers.runAll();
    if (delivery) await act(async () => { await delivery; });
    t.mock.timers.reset();
    await ui.dispose();
  }
});

test('keepalive budget remains occupied until response body finishes, even after headers arrive', async () => {
  const ui = await mount();
  let releaseBody;
  let releaseFirstLookup;
  let releaseSecondLookup;
  let firstDelivery;
  let secondDelivery;
  let readingFirstBody = false;
  let completedChatBodies = 0;
  const firstBody = new Promise(resolve => { releaseBody = () => resolve('{}'); });
  fixture.lookupWaits.set('teacher-one', new Promise(resolve => {
    releaseFirstLookup = () => resolve({ data: users[0], error: null });
  }));
  fixture.lookupWaits.set('teacher-two', new Promise(resolve => {
    releaseSecondLookup = () => resolve({ data: users[1], error: null });
  }));
  fixture.respond = request => {
    if (request.url === '/api/notify-chat') {
      return Promise.resolve({ ok: true, status: 200, text: async () => { completedChatBodies++; return '{}'; } });
    }
    if (emailRequests().length === 1) {
      return Promise.resolve({ ok: true, status: 200, text() { readingFirstBody = true; return firstBody; } });
    }
    return Promise.resolve(reply());
  };
  try {
    await act(async () => {
      firstDelivery = ui.context.addNotification({ ...teacherEvent(), message: 'x'.repeat(40_000) });
      await nextTurn();
    });
    // Release each recipient lookup only after its Chat body completes. This
    // isolates the email-body budget from either operation's Chat request.
    assert.equal(completedChatBodies, 1);
    assert.equal(emailRequests().length, 0);
    releaseFirstLookup();
    await act(async () => { await nextTurn(); });
    assert.equal(emailRequests().length, 1);
    assert.equal(readingFirstBody, true, 'headers have arrived and body consumption has started');
    assert.equal(emailRequests()[0].keepalive, true);
    const firstBytes = new TextEncoder().encode(JSON.stringify(emailRequests()[0].body)).byteLength;
    assert.ok(firstBytes > 39_000 && firstBytes < 60_000);
    await act(async () => {
      secondDelivery = ui.context.addNotification({ ...teacherEvent('teacher-two', 'request-two'), message: 'y'.repeat(40_000) });
      await nextTurn();
    });
    assert.equal(completedChatBodies, 2);
    assert.equal(emailRequests().length, 1);
    releaseSecondLookup();
    await act(async () => { await nextTurn(); });
    assert.equal(emailRequests().length, 2);
    assert.equal(emailRequests()[1].keepalive, false, 'the pending first body still occupies the shared quota');
    await act(async () => { await secondDelivery; });
    releaseBody();
    await act(async () => { await firstDelivery; });
    assert.equal(fixture.toasts.length, 0);
  } finally {
    releaseFirstLookup?.();
    releaseSecondLookup?.();
    releaseBody?.();
    if (secondDelivery) await act(async () => { await secondDelivery; });
    if (firstDelivery) await act(async () => { await firstDelivery; });
    await ui.dispose();
  }
});
