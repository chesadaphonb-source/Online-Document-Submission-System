import test from 'node:test';
import assert from 'node:assert/strict';
import { selectAdminNotificationEmails } from '../src/app/lib/adminNotificationRecipients.js';

// Synthetic equivalents of three faculty-wide recipients plus three department
// admins. No production addresses, database, environment, or network are used.
const sixAdmins = Object.freeze([
  Object.freeze({ email: 'master@example.invalid', department: 'Department A' }),
  Object.freeze({ email: 'central-one@example.invalid', department: null }),
  Object.freeze({ email: 'central-two@example.invalid', department: 'สำนักงานคณะ' }),
  Object.freeze({ email: 'department-a@example.invalid', department: 'Department A' }),
  Object.freeze({ email: 'department-b@example.invalid', department: 'Department B' }),
  Object.freeze({ email: 'department-c@example.invalid', department: 'Department C' }),
]);
const superAdmins = Object.freeze(['master@example.invalid']);
const centralThree = ['master@example.invalid', 'central-one@example.invalid', 'central-two@example.invalid'];

for (const [department, expectedLocal] of [
  ['Department A', 'department-a@example.invalid'],
  ['Department B', 'department-b@example.invalid'],
  ['Department C', 'department-c@example.invalid'],
]) {
  test(`the three faculty-wide recipients plus only the matching admin receive ${department}`, () => {
    assert.deepEqual(selectAdminNotificationEmails(sixAdmins, department, superAdmins), [...centralThree, expectedLocal]);
  });
}

test('an unknown event department still reaches central recipients without leaking to other department admins', () => {
  assert.deepEqual(selectAdminNotificationEmails(sixAdmins, 'Department D', superAdmins), centralThree);
});

test('all supported blank and explicit central department shapes receive every department', () => {
  const centralDepartments = ['', '   ', null, undefined, 'ทุกภาควิชา / ส่วนกลาง', ' สำนักงานคณะ '];
  const admins = centralDepartments.map((department, index) => ({ email: `central-${index}@example.invalid`, department }));
  assert.deepEqual(selectAdminNotificationEmails(admins, 'Department B'), admins.map(admin => admin.email));
  assert.deepEqual(selectAdminNotificationEmails([{ email: 'missing-field@example.invalid' }], 'Department B'), ['missing-field@example.invalid']);
});

test('department comparison trims and ignores case while requiring the entire department name', () => {
  const admins = [
    { email: 'matching@example.invalid', department: '  DePaRtMeNt A  ' },
    { email: 'prefix@example.invalid', department: 'Department' },
    { email: 'longer@example.invalid', department: 'Department A Extension' },
    { email: 'other@example.invalid', department: 'Department B' },
  ];
  assert.deepEqual(selectAdminNotificationEmails(admins, ' department a '), ['matching@example.invalid']);
});

test('existing super overrides are normalized and preserved without adding absent accounts', () => {
  const admins = [
    { email: ' SUPER@EXAMPLE.INVALID ', department: 'Other Department' },
    { email: 'ordinary@example.invalid', department: 'Other Department' },
  ];
  assert.deepEqual(selectAdminNotificationEmails(admins, 'Department A', [
    ' super@example.invalid ', 'absent@example.invalid', 'invalid',
  ]), ['super@example.invalid']);
  assert.deepEqual(selectAdminNotificationEmails(admins, 'Department A'), []);
});

test('missing or blank event departments preserve the legacy all-admin broadcast', () => {
  const expected = sixAdmins.map(admin => admin.email);
  for (const department of [undefined, null, '', '   ']) {
    assert.deepEqual(selectAdminNotificationEmails(sixAdmins, department), expected);
  }
});

test('email addresses are normalized, deduplicated, validated, and kept in first selected order', () => {
  const admins = [
    { email: ' FIRST@EXAMPLE.INVALID ', department: null },
    { email: 'second+tag@example.invalid', department: '' },
    { email: 'first@example.invalid', department: 'Department A' },
    { email: 'first@example.invalid', department: 'Department B' },
    ...['', null, undefined, 'not-an-address', 'two@@example.invalid', 'x@invalid',
      'a b@example.invalid', 'Name <x@example.invalid>', 'x@example..invalid',
      'x@-example.invalid', 'x@example.invalid,other@example.invalid',
      'x@example.invalid\nBcc:other@example.invalid', 123].map(email => ({ email })),
    null,
  ];
  assert.deepEqual(selectAdminNotificationEmails(admins, 'Department A'), ['first@example.invalid', 'second+tag@example.invalid']);
});

test('a duplicate in a nonmatching department does not suppress a later eligible account', () => {
  const admins = [
    { email: 'same@example.invalid', department: 'Department B' },
    { email: ' SAME@EXAMPLE.INVALID ', department: 'Department A' },
  ];
  assert.deepEqual(selectAdminNotificationEmails(admins, 'Department A'), ['same@example.invalid']);
});

test('selection does not change frozen account rows, input arrays, or exemption values', () => {
  const before = structuredClone(sixAdmins);
  const first = selectAdminNotificationEmails(sixAdmins, 'Department B', superAdmins);
  first.length = 0;
  assert.deepEqual(sixAdmins, before);
  assert.deepEqual(superAdmins, ['master@example.invalid']);
  assert.deepEqual(selectAdminNotificationEmails(sixAdmins, 'Department B', superAdmins), [...centralThree, 'department-b@example.invalid']);
});

test('missing or malformed row collections produce no recipients', () => {
  for (const admins of [undefined, null, {}, 'not-an-array', [null, {}, { email: 123 }]]) {
    assert.deepEqual(selectAdminNotificationEmails(admins, 'Department A'), []);
  }
});
