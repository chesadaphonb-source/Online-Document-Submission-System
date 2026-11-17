import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const output = new URL('../tmp/notification-email-api-tests/', import.meta.url);
await mkdir(output, { recursive: true });
const outfile = new URL(`email-api-${process.pid}.mjs`, output);
await build({
  entryPoints: [fileURLToPath(new URL('../api/send-email.js', import.meta.url))],
  outfile: fileURLToPath(outfile), bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent',
  plugins: [{ name: 'synthetic-smtp-only', setup(builder) {
    builder.onResolve({ filter: /^nodemailer$/ }, () => ({ path: 'smtp', namespace: 'email-fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'email-fixture' }, () => ({ contents: `export default {
      createTransport(options) {
        const fixture=globalThis.__emailApiFixture;
        fixture.transports.push(options);
        if (fixture.transportError) throw fixture.transportError;
        return { async sendMail(message) {
          fixture.sent.push(message);
          if (fixture.error) throw fixture.error;
          return fixture.result;
        } };
      }
    };` }));
    builder.onLoad({ filter: /[\\/]api[\\/]send-email\.js$/ }, async ({ path }) => ({
      // Never read actual service credentials. The production handler and its
      // template run unchanged apart from redirecting environment lookup.
      contents: (await readFile(path, 'utf8')).replaceAll('process.env.', 'globalThis.__emailApiFixture.environment.'),
      loader: 'js',
    }));
  } }],
});
const { default: handler } = await import(pathToFileURL(fileURLToPath(outfile)).href);

const REQUESTED = ['teacher@example.invalid', 'head@example.invalid'];
const FAKE_SECRET = 'FAKE_PASSWORD_NEVER_LOG';
const bodyFor = (to = REQUESTED) => ({
  to, subject: 'Synthetic teacher notification', type: 'forwarded_to_teacher', submissionId: 'request-fixture',
  message: 'PRIVATE_TEST_MESSAGE', studentName: 'Synthetic Student Name', studentEmail: 'student@example.invalid',
  studentId: 'SYNTHETIC_STUDENT_001', submissionName: 'Synthetic Petition Name', senderName: 'Synthetic Sender Name',
});

async function invoke({ body = bodyFor(), result, error, transportError, environment } = {}) {
  const fixture = {
    environment: environment || { GMAIL_USER: 'sender@example.invalid', GMAIL_APP_PASSWORD: FAKE_SECRET },
    result: result === undefined ? { accepted: REQUESTED, rejected: [], messageId: '<fixture-message@example.invalid>' } : result,
    error, transportError, transports: [], sent: [], logs: [],
  };
  const previous = { fixture: globalThis.__emailApiFixture, log: console.log, warn: console.warn, error: console.error };
  globalThis.__emailApiFixture = fixture;
  for (const level of ['log', 'warn', 'error']) console[level] = (...args) => fixture.logs.push({ level, args });
  const response = { statusCode: 0, body: null,
    status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; },
  };
  try {
    await handler({ method: 'POST', body }, response);
  } finally {
    previous.fixture === undefined ? delete globalThis.__emailApiFixture : globalThis.__emailApiFixture = previous.fixture;
    console.log = previous.log; console.warn = previous.warn; console.error = previous.error;
  }
  return { fixture, response };
}

function assertSafeDiagnostics({ fixture, response }, extraSecrets = []) {
  const diagnostics = JSON.stringify({ logs: fixture.logs, response: response.body });
  for (const secret of [FAKE_SECRET, ...REQUESTED, 'student@example.invalid', 'sender@example.invalid',
    'PRIVATE_TEST_MESSAGE', 'Synthetic Student Name', 'SYNTHETIC_STUDENT_001', 'Synthetic Petition Name', 'Synthetic Sender Name', ...extraSecrets]) {
    assert.ok(!diagnostics.includes(secret), `diagnostics must not expose ${secret}`);
  }
  assert.equal(Object.hasOwn(response.body, 'detail'), false);
}

test('all requested addresses must be accepted; normalized duplicates are sent once', async () => {
  const value = await invoke({ body: bodyFor([' Teacher@Example.invalid ', 'teacher@example.invalid', 'HEAD@example.invalid']),
    result: { accepted: ['TEACHER@example.invalid', 'head@example.invalid', 'teacher@example.invalid'], rejected: [], messageId: '<fixture-message@example.invalid>' } });
  assert.equal(value.response.statusCode, 200);
  assert.equal(value.response.body.success, true);
  assert.equal(value.response.body.requestedCount, 2);
  assert.equal(value.response.body.acceptedCount, 2);
  assert.equal(value.response.body.rejectedCount, 0);
  assert.equal(value.fixture.sent.length, 1);
  assert.equal(value.fixture.sent[0].to, 'teacher@example.invalid, head@example.invalid');
  const log = value.fixture.logs[0].args[1];
  assert.equal(log.type, 'forwarded_to_teacher');
  assert.equal(log.submissionId, 'request-fixture');
  assert.equal(log.messageId, '<fixture-message@example.invalid>');
  assertSafeDiagnostics(value);
});

test('existing Gmail App Password whitespace removal is preserved with synthetic credentials', async () => {
  const spacedPassword = 'FAKE APP\tPASSWORD\nWITH\r SPACES';
  const normalizedPassword = 'FAKEAPPPASSWORDWITHSPACES';
  const value = await invoke({ environment: { GMAIL_USER: 'sender@example.invalid', GMAIL_APP_PASSWORD: spacedPassword } });
  assert.equal(value.response.statusCode, 200);
  assert.equal(value.fixture.transports[0].service, 'gmail');
  assert.equal(value.fixture.transports[0].auth.user, 'sender@example.invalid');
  assert.equal(value.fixture.transports[0].auth.pass, normalizedPassword);
  assertSafeDiagnostics(value, [spacedPassword, normalizedPassword]);
});

test('partial acceptance returns a non-2xx partial result and never retries accepted recipients', async () => {
  const value = await invoke({ result: { accepted: [REQUESTED[0]], rejected: [REQUESTED[1]],
    response: '550 RAW_PROVIDER_RESPONSE ' + FAKE_SECRET, messageId: '<partial-fixture@example.invalid>' } });
  assert.equal(value.response.statusCode, 502);
  assert.equal(value.response.body.success, false);
  assert.equal(value.response.body.partial, true);
  assert.equal(value.response.body.code, 'EMAIL_PARTIALLY_ACCEPTED');
  assert.equal(value.response.body.requestedCount, 2);
  assert.equal(value.response.body.acceptedCount, 1);
  assert.equal(value.response.body.rejectedCount, 1);
  assert.equal(value.fixture.sent.length, 1);
  assertSafeDiagnostics(value, ['RAW_PROVIDER_RESPONSE']);
});

test('all rejected recipients return failure without a success claim or second SMTP attempt', async () => {
  const value = await invoke({ result: { accepted: [], rejected: REQUESTED, messageId: '<rejected-fixture@example.invalid>' } });
  assert.equal(value.response.statusCode, 502);
  assert.equal(value.response.body.partial, false);
  assert.equal(value.response.body.code, 'EMAIL_NOT_ACCEPTED');
  assert.equal(value.response.body.acceptedCount, 0);
  assert.equal(value.response.body.rejectedCount, 2);
  assert.equal(value.fixture.sent.length, 1);
  assertSafeDiagnostics(value);
});

test('missing or unrelated SMTP acceptance evidence cannot become HTTP 200', async () => {
  for (const result of [{}, { accepted: [], rejected: [] }, { accepted: ['unrelated@example.invalid'], rejected: [] }]) {
    const value = await invoke({ result });
    assert.equal(value.response.statusCode, 502);
    assert.equal(value.response.body.code, 'EMAIL_NOT_ACCEPTED');
    assert.equal(value.response.body.acceptedCount, 0);
    assert.equal(value.fixture.sent.length, 1);
    assertSafeDiagnostics(value, ['unrelated@example.invalid']);
  }
});

test('a recipient reported as both accepted and rejected is not counted as accepted', async () => {
  const value = await invoke({ result: { accepted: REQUESTED, rejected: [REQUESTED[0]] } });
  assert.equal(value.response.statusCode, 502);
  assert.equal(value.response.body.acceptedCount, 1);
  assert.equal(value.response.body.rejectedCount, 1);
  assertSafeDiagnostics(value);
});

test('valid SMTP address objects are recognized without logging the address objects', async () => {
  const value = await invoke({ result: { accepted: REQUESTED.map(address => ({ address })), rejected: [] } });
  assert.equal(value.response.statusCode, 200);
  assert.equal(value.response.body.acceptedCount, 2);
  assertSafeDiagnostics(value);
});

test('invalid recipient values reject the whole request before constructing or calling SMTP', async () => {
  for (const to of [null, [], 42, [null], [REQUESTED[0], 'not-an-email'], 'teacher@example.invalid\r\nBcc: other@example.invalid', 'Teacher <teacher@example.invalid>']) {
    const value = await invoke({ body: bodyFor(to) });
    assert.equal(value.response.statusCode, 400);
    assert.equal(value.fixture.transports.length, 0);
    assert.equal(value.fixture.sent.length, 0);
    assertSafeDiagnostics(value, ['other@example.invalid']);
  }
});

test('thrown SMTP errors expose only safe codes and correlation metadata', async () => {
  const error = Object.assign(new Error(`RAW_SMTP_MESSAGE ${FAKE_SECRET} ${REQUESTED[0]}`), {
    code: 'EAUTH', command: 'AUTH PLAIN', responseCode: 535,
    response: `535 RAW_SMTP_RESPONSE ${FAKE_SECRET} student@example.invalid`,
  });
  const value = await invoke({ error });
  assert.equal(value.response.statusCode, 502);
  assert.equal(value.response.body.success, false);
  assert.equal(value.response.body.code, 'EMAIL_SEND_FAILED');
  assert.equal(value.fixture.sent.length, 1);
  const log = value.fixture.logs[0].args[1];
  assert.equal(log.code, 'EAUTH');
  assert.equal(log.command, 'AUTH PLAIN');
  assert.equal(log.responseCode, 535);
  assert.equal(log.submissionId, 'request-fixture');
  assertSafeDiagnostics(value, ['RAW_SMTP_MESSAGE', 'RAW_SMTP_RESPONSE']);
});

test('unsafe SMTP diagnostic fields and injected correlation data are omitted', async () => {
  const error = Object.assign(new Error(FAKE_SECRET), {
    code: `EAUTH ${FAKE_SECRET}`, command: 'RCPT TO:<teacher@example.invalid>', responseCode: `535 ${FAKE_SECRET}`,
  });
  const value = await invoke({ body: { ...bodyFor(), type: 'student@example.invalid', submissionId: 'request student@example.invalid' }, error });
  assert.equal(value.response.statusCode, 502);
  const log = value.fixture.logs[0].args[1];
  for (const key of ['code', 'command', 'responseCode', 'type', 'submissionId']) assert.equal(log[key], undefined);
  assertSafeDiagnostics(value);
});

test('transport setup errors are caught without exposing configuration or raw exceptions', async () => {
  const value = await invoke({ transportError: Object.assign(new Error(FAKE_SECRET), { code: 'ECONNECTION', command: 'CONN' }) });
  assert.equal(value.response.statusCode, 502);
  assert.equal(value.response.body.code, 'EMAIL_SEND_FAILED');
  assert.equal(value.fixture.sent.length, 0);
  assert.equal(value.fixture.transports.length, 1);
  assertSafeDiagnostics(value);
});
