type RunItemSnapshop={
  unique_external_id:string;
  name: string;
  status: string;
  olt_name?: string;
  catv?: string;
  zone_name?:string;
  comment?: string;
  authorization_date?: string;
}

type Run = {
  runId: string;
  type: "upz" | "upzMeta" | "zona" | "estado" | "uplinkVlan";
  key: string;
  ids: string[];
  createdAt: number;
  expiresAt: number;
  itemsById?: Record<string, RunItemSnapshop>;
};

const runs = new Map<string, Run>();
const exportedByKey = new Map<string, Set<string>>();

export function createRun(type: Run["type"], key: string, ids: string[], ttlMs = 15 * 60_000, extra:Partial<Run>={}): Run {
  const runId = `${type}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const run: Run = {
    runId,
    type,
    key,
    ids,
    createdAt: Date.now(),
    expiresAt: Date.now() + ttlMs,
    ...extra,
  };

  runs.set(runId, run);
  return run;
}

export function getRun(runId: string): Run | null {
  const r = runs.get(runId);
  if (!r) return null;
  if (Date.now() > r.expiresAt) { runs.delete(runId); return null; }
  return r;
}

export function getExportedSet(key: string): Set<string> {
  let s = exportedByKey.get(key);
  if (!s) { s = new Set(); exportedByKey.set(key, s); }
  return s;
}

export function markExported(key: string, ids: string[]) {
  const s = getExportedSet(key);
  ids.forEach(id => s.add(id));
}