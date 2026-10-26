/** Hands the proposed entries from the voice-note or document screen to the review screen (SPEC 20.1 step 7). */
import { create } from 'zustand';
import type { AiErrorCode } from '../ai/client';
import type { Proposal } from '../voice/review';

export interface ReviewDraft {
  noteId: string; source: 'voice' | 'document'; proposals: Proposal[]; via: 'ai' | 'rules'; aiError: AiErrorCode | null;
}

interface ReviewState { draft: ReviewDraft | null; set: (d: ReviewDraft | null) => void; }

export const useReview = create<ReviewState>((set) => ({ draft: null, set: (draft) => set({ draft }) }));
