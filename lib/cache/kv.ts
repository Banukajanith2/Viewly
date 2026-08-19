/**
 * Upstash Redis cache wrapper - PLACEHOLDER, implemented in Part 7.
 * Sits in front of Firestore for dashboard snapshots and niche-cache hot paths,
 * so repeated dashboard loads don't burn the ~50k/day Firestore read budget.
 */
export async function get<T>(_key: string): Promise<T | null> {
  throw new Error("Not implemented - Part 7");
}

export async function set<T>(_key: string, _value: T, _ttlSeconds: number): Promise<void> {
  throw new Error("Not implemented - Part 7");
}

export async function del(_key: string): Promise<void> {
  throw new Error("Not implemented - Part 7");
}
