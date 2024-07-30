import { create } from 'zustand';

const userId = `${Math.floor(Math.random() * 1000)}`;

interface GlobalStore {
  userId: typeof userId;
}

export const useGlobalStore = create<GlobalStore>()(() => ({ userId }));
