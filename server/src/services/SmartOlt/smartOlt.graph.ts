import *as client from "./smartOlt.client.js";
import { getGraphCache, setGraphCache } from "./smartOlt.graphCache.js";

export async function  getMonthlyGraphCached(
    externalId: string,
    kind: "signal_monthly" | "traffic_monthly",
    opts: {forceRefresh?: boolean} = {}
) {
    const {forceRefresh = false}=opts;
    if(!forceRefresh){
        const cached = getGraphCache(externalId, kind);
        if(cached){
            return{
                ok: cached.ok,
                dataUrL: cached.dataUrl,
                text: cached.text,
                forceRefresh: true,
            };
        }
    }
    const response = 
        kind === "signal_monthly"
        ?await client.getOnuSignalGraphDataUrl(externalId, "monthly")
        : await client.getOnuTrafficGraphDataUrl(externalId, "monthly");

    const saved = setGraphCache(
        externalId,
        kind,
        {
            ok: !!response?.ok,
            dataUrl: response?.dataUrl,
            text: response?.text,
        },
        60*60*1000
    );

    return {
        ok: saved.ok,
        dataUrl: saved.dataUrl,
        text: saved.text,
        fromCache: false
    }
}