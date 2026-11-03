# Signature placement hotfix

This branch is based on `main` and contains placement preview, Admin precision controls, and the narrowly related save flow. It does not include the separate SIT security/refactoring batch.

The placement editor previously rendered text using fixed CSS pixels and a fallback/local font, while PDF export uses the embedded TH Sarabun New font at `storedSize * 0.85` points. Signature borders and transforms also shifted or resized the preview ink.

Both placement editors now draw text/date/checkmark overlays in the same A4 millimetre coordinate space as the existing PDF renderer. They load the exact embedded font and use the same text width and baseline. Non-layout outlines replace borders, and signature transforms were removed. Existing positions are not automatically migrated.

Admin controls now include selection of each signature/text/date/checkmark, X/Y input in millimetres, 0.1mm arrow nudges (1mm with Shift), zoom from 50–200%, 5mm guides, and bounded undo/redo. One drag is one undo entry. Measurements use the actual scaled page and annotation bounds. Keyboard shortcuts do not intercept text input. Page selections that do not exist in the document block saving until corrected.

Edits apply only to the open request. The unverified cross-request copy chooser has been removed from this editor. There is no automatic reuse of these positions on other forms.

The editor retains the version it opened. Saving generates the PDF from its real original, uploads a unique file, then updates positions/file reference/adjustment metadata together using the opening `updated_at` as a compare-and-set condition. State and success are published only after a confirmed database update. A failed upload, missing source, or conflict keeps the editor open. Approval identities/status and non-layout workflow evidence are preserved. The existing general preview/download template-fallback policy is unchanged; Admin adjustment saves specifically reject replacement templates.

Validation:

- `npm test`: 56 tests pass, including the actual editor and Context with mocked services, unit geometry/history, PDF scale/font alignment, and ordered/conflict-safe persistence. No tests call production services.
- `node scripts/qa-document-overlay.js`: 63 raster-bound comparisons pass at 320/560/840 pixel document widths. Sampling differs by up to 2 pixels for signatures at the smallest width, and 1 pixel otherwise.
- `npm run build`: passes with existing large-bundle/mixed-import warnings.
- Browser drag/touch interaction has not been tested in an actual browser in this session.

Manual acceptance before deployment: check fine nudging, dragging, selecting extra annotations and undo/redo at 50%, 100%, and 200%; enter edge coordinates; compare the resulting PDF against the editor; change pages on a multi-page form; and confirm a stale request version is rejected. Use an isolated SIT project and synthetic data for this acceptance pass.

If upload succeeds and a later database compare-and-set fails, the unique unreferenced upload can remain in storage. This patch does not delete storage objects or change database permissions. General approval transitions and other legacy persistence paths remain outside this patch.

No push/deployment or production request changes are part of this Admin-control implementation.

The QA script uses a synthetic fixture. Generated artifacts, private documents, snapshots, credentials, and production repair scripts must not be committed. No production record repair is automatically performed by building or deploying this branch.
