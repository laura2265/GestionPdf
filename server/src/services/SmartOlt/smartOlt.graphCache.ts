type GraphKind = "signal_monthly" | "traffic_monthly";

type GraphCacheItem ={
    key: string;
    externalId: string;
    kind: GraphKind;
    dataUrl: string | null;
    ok: boolean;
    text: string;
    fetchedAt: number,
    expiresAt: number;
}

const graphCache = new Map<string, GraphCacheItem>();

function makeKey(externalId: string, kind: GraphKind){
    return `${externalId}:${kind}`
}

export function getGraphCache(externalId: string, kind: GraphKind){
    const key = makeKey(externalId, kind);
    const item = graphCache.get(key);
    if(!item) return null;
    if(Date.now() > item.expiresAt){
        graphCache.delete(key);
        return null;
    }
    return item
}

export function setGraphCache(
    externalId: string,
    kind: GraphKind,
    payload: {
        ok: boolean;
        dataUrl?: string;
        text?: string
    },
    ttlMs=60*60*1000
){
    const key = makeKey(externalId, kind);
    const item: GraphCacheItem={
        key,
        externalId,
        kind,
        ok: payload.ok,
        dataUrl: payload.dataUrl ?? null,
        text: payload.text,
        fetchedAt: Date.now(),
        expiresAt: Date.now()+ttlMs,
    }
    graphCache.set(key, item);
    return item;
}

