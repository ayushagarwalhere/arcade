const rows = new Map<string, string>();
export default {
  getItem: async (k: string) => rows.get(k) ?? null,
  setItem: async (k: string, v: string) => void rows.set(k, v),
  removeItem: async (k: string) => void rows.delete(k),
  clear: async () => rows.clear(),
};
