# Teacher notification audit — 17 November 2026

The owner requested the sustainability department first, then the other
departments. Production source was verified as the release merged at
`2ef72feaa638b07ebffeabe937865a33850e845d`; its public application asset still
matched the previously verified release digest.

## Read-only metadata findings

Window: 10 November 2026 00:00 UTC onward (07:00 Bangkok), inspected on the
morning of 17 November. Queries used the same public anon access as the deployed
application. They read only teacher account/email metadata and projected request
and notification identifiers, departments, workflow levels and statuses.

| Request department | Requests with teacher notices | Stored teacher notices | Initial forwarding | Forwarded after approval |
| --- | ---: | ---: | ---: | ---: |
| ภาควิชาสิ่งแวดล้อมเพื่อความยั่งยืน | 24 | 40 | 13 | 27 |
| ภาควิชาเทคโนโลยีและการจัดการสิ่งแวดล้อม | 7 | 14 | 4 | 10 |
| ภาควิชาวิทยาศาสตร์สิ่งแวดล้อม | 2 | 4 | 2 | 2 |

- All 58 notification recipients matched current teacher accounts with
  syntactically valid email addresses. No duplicate teacher email addresses were
  found among the 44 current teacher accounts.
- All 10 recent requests currently in review had a current assigned teacher
  account and a stored notice for that teacher/request: 8 sustainability and
  2 technology/management. No request fell outside the workflow metadata
  projection of up to 10 steps.
- A second audit removed the submitted-date filter and checked all 26 currently
  in-review requests: 10 sustainability, 7 technology/management, and 9 science.
  Every current assigned teacher matched a current account and a stored notice
  for that request. The 100-request/300-notice limits were not reached; the query
  returned 26 requests and 38 teacher-notice metadata rows. No signatures,
  comments, names, or attachments were included in the projection.
- Notices are grouped by the student's request department. A faculty approver
  can legitimately receive requests from multiple departments.
- The account and event query limits of 100 rows were not reached.

These are stored in-app notification counts, not email delivery counts. Current
account data cannot prove what an email lookup returned at the original send
time, nor that an address belongs to the intended mailbox.

## Delivery evidence and candidate correction

The available production email runtime/request logs for the last 30 minutes
contained no records. A query covering the latest teacher event at approximately
09:35 Bangkok was unavailable under the project's log retention. Consequently
the reported incident's exact SMTP outcome is unconfirmed.

Mocked tests reproduced a shared delivery path blocking email behind Chat,
teacher lookup fallback to a student's address, and unchecked batch HTTP errors.
The candidate correction and limits are documented in
[teacher-email-delivery.md](teacher-email-delivery.md).

No documents, attachments, signatures, notification messages, or student names
were read. No production rows were changed or emails sent. The candidate has not
been deployed as part of this audit.
