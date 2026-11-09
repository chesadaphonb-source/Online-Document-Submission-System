import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Load the real provider and recipient helper. Only connected services and the
// authenticated profile are replaced; every address below is synthetic.
const output = new URL('../tmp/admin-notification-context/', import.meta.url);
await mkdir(output, { recursive: true });
const outfile = new URL(`provider-${process.pid}.mjs`, output);
await build({
  entryPoints: [fileURLToPath(new URL('../src/app/context/NotificationContext.tsx', import.meta.url))],
  outfile: fileURLToPath(outfile), bundle: true, platform: 'node', format: 'esm',
  packages: 'external', jsx: 'automatic', logLevel: 'silent',
  plugins: [{ name: 'notification-service-fixtures', setup(builder) {
    builder.onResolve({ filter: /(?:^|\/)lib\/supabase$/ }, () => ({ path: 'database', namespace: 'notification-fixture' }));
    builder.onResolve({ filter: /(?:^|\/)AuthContext$/ }, () => ({ path: 'auth', namespace: 'notification-fixture' }));
    builder.onResolve({ filter: /(?:^|\/)SystemContext$/ }, () => ({ path: 'system', namespace: 'notification-fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'notification-fixture' }, ({ path }) => ({ contents:
      path === 'database'
        ? 'export const supabase = globalThis.__notificationFixture.client; export const isSupabaseConfigured = true;'
        : path === 'auth'
          ? 'export function useAuth() { return {currentUser:globalThis.__notificationFixture.currentUser}; }'
          : 'export const SUPER_ADMIN_EMAILS = Object.freeze(["master@example.invalid"]);',
    }));
  } }],
});

const DEPT_A = 'ภาควิชาทดสอบ A';
const DEPT_B = 'ภาควิชาทดสอบ B';
const admins = Object.freeze([
  Object.freeze({ id: 'master-fixture', email: 'master@example.invalid', role: 'admin', department: 'หน่วยงานผู้ดูแลทดสอบ' }),
  Object.freeze({ id: 'central-a-fixture', email: 'central-a@example.invalid', role: 'admin', department: '' }),
  Object.freeze({ id: 'central-b-fixture', email: 'central-b@example.invalid', role: 'admin', department: 'สำนักงานคณะ' }),
  Object.freeze({ id: 'dept-a-fixture', email: 'dept-a@example.invalid', role: 'admin', department: DEPT_A }),
  Object.freeze({ id: 'dept-b-fixture', email: 'dept-b@example.invalid', role: 'admin', department: DEPT_B }),
]);
const individual = Object.freeze({ id: 'teacher-fixture', email: 'teacher@example.invalid', role: 'teacher', department: DEPT_B });
const currentUser = Object.freeze({ id: 'student-fixture', email: 'student@example.invalid', role: 'student', department: DEPT_A });
const fixture = {
  currentUser, admins, usersQueries: [], notificationInserts: [], requests: [], logs: [],
};

function queryFor(table) {
  const filters = [];
  const queryRecord = { table, columns: null, filters };
  if (table === 'users') fixture.usersQueries.push(queryRecord);
  const data = () => {
    if (table === 'notifications') return [];
    const id = filters.find(([field]) => field === 'id')?.[1];
    const role = filters.find(([field]) => field === 'role')?.[1];
    const rows = id ? [individual].filter(row => row.id === id) : [...admins, individual].filter(row => !role || row.role === role);
    return rows.map(row => Object.fromEntries(queryRecord.columns.split(',').map(key => [key.trim(), row[key.trim()]])));
  };
  const query = {
    select(columns) { queryRecord.columns = columns; return query; },
    eq(field, value) { filters.push([field, value]); return query; },
    or() { return query; }, order() { return query; }, limit() { return query; },
    then(resolve, reject) { return Promise.resolve({ data: data(), error: null }).then(resolve, reject); },
    async maybeSingle() { return { data: data()[0] || null, error: null }; },
    async insert(rows) {
      assert.equal(table, 'notifications', 'the provider must not create or mutate user accounts');
      fixture.notificationInserts.push(structuredClone(rows));
      return { error: null };
    },
    update() { assert.fail('routing must not update user roles, profiles, or notification read state'); },
    delete() { assert.fail('routing must not delete users or profiles'); },
  };
  return query;
}
fixture.client = {
  from(table) { assert.ok(['users', 'notifications'].includes(table)); return queryFor(table); },
  channel() {
    const subscription = { on() { return subscription; }, subscribe() { return subscription; } };
    return subscription;
  },
  removeChannel() {},
};
globalThis.__notificationFixture = fixture;
const { NotificationProvider, useNotifications } = await import(pathToFileURL(fileURLToPath(outfile)).href);

async function mount() {
  fixture.usersQueries = []; fixture.notificationInserts = []; fixture.requests = []; fixture.logs = [];
  const saved = { window: globalThis.window, fetch: globalThis.fetch, log: console.log };
  // Exercise the existing production-delivery branch with a mocked fetch that
  // rejects every URL except the two relative API paths. No HTTP is performed.
  globalThis.window = { location: { hostname: 'ku-envipaper.vercel.app' } };
  globalThis.fetch = async (url, options = {}) => {
    assert.ok(url === '/api/send-email' || url === '/api/notify-chat', 'unexpected network request');
    fixture.requests.push({ url, body: JSON.parse(options.body), method: options.method });
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  console.log = (...args) => fixture.logs.push(args);
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
      console.log = saved.log;
    },
  };
}

function adminEvent(department, id = 'request-fixture') {
  return { recipientId: 'role:admin', submissionId: id, submissionName: 'คำร้องจำลอง',
    type: 'new_submission', title: 'รายการจำลองสำหรับ Admin', message: 'ข้อมูลทดสอบเท่านั้น',
    department, studentEmail: 'student@example.invalid' };
}
const emailRequests = () => fixture.requests.filter(request => request.url === '/api/send-email');
const sorted = values => [...values].sort();
const expectedFor = department => sorted(['master@example.invalid', 'central-a@example.invalid', 'central-b@example.invalid', department === DEPT_A ? 'dept-a@example.invalid' : 'dept-b@example.invalid']);

function assertRolesAndQueryUnchanged() {
  assert.equal(fixture.currentUser, currentUser);
  assert.equal(fixture.currentUser.role, 'student');
  assert.ok(admins.every(row => row.role === 'admin'));
  assert.equal(individual.role, 'teacher');
  assert.ok(fixture.usersQueries.filter(query => query.filters.some(([key]) => key === 'role')).every(query =>
    query.columns === 'email, department' && query.filters.some(([key, value]) => key === 'role' && value === 'admin')));
}

test('addNotification sends the Admin event to master, two ordinary central Admins and matching department only', async () => {
  const ui = await mount();
  try {
    await act(async () => { await ui.context.addNotification(adminEvent(DEPT_A)); });
    assert.equal(emailRequests().length, 1);
    assert.deepEqual(sorted(emailRequests()[0].body.to), expectedFor(DEPT_A));
    assert.equal(emailRequests()[0].body.department, DEPT_A);
    assert.equal(fixture.notificationInserts.length, 1);
    assert.equal(fixture.notificationInserts[0].recipient_id, 'role:admin');
    assert.equal(fixture.usersQueries.length, 1);
    assert.equal(fixture.requests.filter(request => request.url === '/api/notify-chat').length, 1);
    assertRolesAndQueryUnchanged();
  } finally { await ui.dispose(); }
});

test('addNotifications applies the same central/department routing separately to each event', async () => {
  const ui = await mount();
  try {
    await act(async () => { await ui.context.addNotifications([adminEvent(DEPT_A, 'request-a'), adminEvent(DEPT_B, 'request-b')]); });
    assert.equal(emailRequests().length, 2);
    for (const request of emailRequests()) assert.deepEqual(sorted(request.body.to), expectedFor(request.body.department));
    assert.equal(fixture.notificationInserts.length, 1);
    assert.deepEqual(fixture.notificationInserts[0].map(row => row.recipient_id), ['role:admin', 'role:admin']);
    assert.equal(fixture.requests.filter(request => request.url === '/api/notify-chat').length, 1);
    assert.equal(fixture.usersQueries.length, 2);
    assertRolesAndQueryUnchanged();
  } finally { await ui.dispose(); }
});

test('individual recipient stays individual in both single and batch notification paths', async () => {
  const ui = await mount();
  try {
    const event = { ...adminEvent(DEPT_A), recipientId: individual.id, type: 'forwarded_to_teacher' };
    await act(async () => { await ui.context.addNotification(event); });
    await act(async () => { await ui.context.addNotifications([event]); });
    assert.equal(emailRequests().length, 2);
    assert.ok(emailRequests().every(request => request.body.to.length === 1 && request.body.to[0] === individual.email));
    assert.ok(fixture.usersQueries.every(query => query.columns === 'email, role' && query.filters.some(([key, value]) => key === 'id' && value === individual.id)));
    assertRolesAndQueryUnchanged();
  } finally { await ui.dispose(); }
});
