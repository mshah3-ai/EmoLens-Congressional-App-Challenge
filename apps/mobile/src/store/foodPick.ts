/** Hands a scanned food from the barcode screen back to the meal sheet underneath it. */
import { create } from 'zustand';
import type { FoodPick } from '../integrations/food';

interface FoodPickState { pending: FoodPick | null; put: (f: FoodPick) => void; take: () => FoodPick | null }

export const useFoodPick = create<FoodPickState>((set, get) => ({
  pending: null,
  put: (f) => set({ pending: f }),
  take: () => { const f = get().pending; set({ pending: null }); return f; },
}));
