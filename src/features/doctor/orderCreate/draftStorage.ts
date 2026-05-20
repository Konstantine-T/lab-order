import type { WizardState } from './types';

const DRAFT_KEY = 'lab_order_draft';

export type DraftData = {
  state: WizardState;
  step: number;
  labName: string;
  serviceName: string;
};

export function saveDraft(data: DraftData): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
  } catch { /* storage unavailable */ }
}

export function loadDraft(): DraftData | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as DraftData) : null;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  localStorage.removeItem(DRAFT_KEY);
}
