# Primary request and supporting attachments

Changes are local to `hotfix/signature-placement`. No database migration or PRD update is required to prepare/review this change.

## Behavior

- Students choose one PDF as the primary request and upload supporting PDFs separately, with the existing 20 MB per-file limit.
- The primary file is named and previewable again before submission. Supporting evidence is listed separately.
- Removing the primary retains all supporting files and requires the student to choose another primary explicitly. A supporting PDF can be selected as primary; the previous primary moves into its place among the supporting files.
- Uploading disables navigation, draft actions, and file changes until upload completion.
- New drafts include `attachmentSelection`, so an intentionally missing primary remains missing after save/reload. Legacy drafts interpret their existing first attachment as primary. Invalid explicit selections do not fall back to treating supporting files as primary.
- Submission writes the existing attachments array with primary at index 0, followed by supporting files. Approval steps and storage schema remain unchanged.
- Student tracking and the shared viewer label the same primary/supporting roles. The viewer downloads original supporting files and offers signed PDF generation only for the primary.
- The signing dialog targets the primary attachment. A generated-document fallback remains for legacy records with no attachments; it cannot replace an existing primary. Missing primary URLs do not cause promotion of a supporting file.

## Compatibility

Existing submitted records retain their original order and continue using attachment 0 as the signing target. This change cannot infer whether an old first file was the correct form; existing records are not rewritten.

## Verification

- Selection tests cover immutable updates, primary removal, explicit promotion, ordering, legacy drafts, explicit-null drafts, malformed selections, and PDF primary validation.
- Component tests exercise the real reader/signing components with network-free adapters, including primary/supporting downloads, cache switching, and signing-target selection.
- Submission integration tests use the actual student component with isolated contexts, storage and router adapters. They inspect the submitted payload and draft state without writing to a database.
- App build runs with `envDir:false` into `tmp/attachment-feature-app-dist`.

Completed verification: 85 release tests plus 3 local offline-demo safety tests passed, app build passed, and `git diff --check` passed. No live storage/database operations were performed during these tests. The generated attachment demo and its SHA-256 audit were independently checked; both inline scripts parse and all seven network guards block their APIs without running the app. Local demo sources and generated artifacts are excluded from the production release.

## Offline review

Run `node scripts/build-admin-offline-demo.js --attachments` to generate `output/demo/attachment-roles-offline.html` and its audit JSON. The demo mounts the actual upload/review components with invented PDFs containing fixed text only. Selected files' names/content are ignored; all changes stay in memory.

The demo is one HTML file with no external assets. Environment loading and public-directory copying are disabled. CSP blocks connections, frames and workers, and immutable guards block fetch, XHR, sockets, event streams, workers and beacons. The builder verifies these guards and checks the result for production references before writing it.
