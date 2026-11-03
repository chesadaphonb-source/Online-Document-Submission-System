import type { Attachment } from '../data/mockData';

export interface AttachmentSelection {
  primary: Attachment | null;
  supporting: Attachment[];
}

export function createAttachmentSelection(attachments?: readonly Attachment[]): AttachmentSelection;
export function restoreAttachmentSelection(draft: unknown): AttachmentSelection;
export function getDraftAttachments(selection: AttachmentSelection): Attachment[];
export function getSubmissionAttachments(selection: AttachmentSelection): Attachment[];
export function setPrimaryAttachment(selection: AttachmentSelection, attachment: Attachment | null): AttachmentSelection;
export function addSupportingAttachments(selection: AttachmentSelection, attachments: readonly Attachment[]): AttachmentSelection;
export function removeSupportingAttachment(selection: AttachmentSelection, index: number): AttachmentSelection;
export function promoteSupportingAttachment(selection: AttachmentSelection, index: number): AttachmentSelection;
