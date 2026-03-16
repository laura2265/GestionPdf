import  * as client from "./smartOlt.client.js";
import { HttpError, isSmartOltHourlyLimit } from "./smartOlt.client.js";

type CatalogState={
    onus: any[];
    updatedAt: number | null;
    expiresAt: number | null;
    cooldownUntil: number | null;
    source: "live" | "cache" | null;
    lastError: any | null;
};

const CATALOG_TTL_MS = 60 * 60 * 1000;
const LIMIT_COOLDOWN_MS = 15 * 60 * 1000;

const catalogState: CatalogState = {
    onus: [],
    updatedAt: null,
    expiresAt: null,
    cooldownUntil: null,
    source: null,
    lastError: null,
}

function hasFreshCastalog(){
    return(
        Array.isArray(catalogState.onus) &&
        catalogState.onus.length > 0 && 
        !!catalogState.expiresAt&&
        Date.now()<catalogState.expiresAt
    )
}

function hasAnyCatalog(){
    return Array.isArray(catalogState.onus) && catalogState.onus.length > 0;
}

function isInCooldown(){
    return !!catalogState.cooldownUntil && Date.now() <catalogState.cooldownUntil;
}

export function getCatalogState(){
    return{
        count: catalogState.onus.length,
        updatedAt: catalogState.updatedAt,
        expiresAt: catalogState.expiresAt,
        cooldownUntil: catalogState.cooldownUntil,
        source: catalogState.source,
        hasData: hasAnyCatalog(),
    }
}

export function clearCatalogCache(){
    catalogState.onus = [];
    catalogState.updatedAt = null;
    catalogState.expiresAt = null;
    catalogState.cooldownUntil = null;
    catalogState.source = null;
    catalogState.lastError = null;
}

export async function warmCatalogCache() {
    return refreshCatalogFromSmartOlt()
}

export async function refreshCatalogFromSmartOlt() {
    const r = await client.getAllOnusDetails({refresh: true});
    if(!r.ok){
        const data = (r as any).data;
        catalogState.lastError = data ?? r;
        if(isSmartOltHourlyLimit(data)){
            throw new HttpError(429, "SmartOlt alcanzo el limite de consultas por hora.", data)
        }
        throw new HttpError((r as any).status ??503, `Error consultafon SmartOlr (get_all_onus_details)`, data);
    }

    const onus = Array.isArray((r as any).onus) ? (r as any).onus : [];
    const now = Date.now();
    catalogState.onus= onus;
    catalogState.updatedAt= now;
    catalogState.expiresAt= now + CATALOG_TTL_MS;
    catalogState.cooldownUntil= null;
    catalogState.source = "live";
    catalogState.lastError=  null;

    return{
        onus,
        source: "liver" as const,
        updatedAt: now,
        expiresAt: catalogState.expiresAt,
        fromCache: r.fromCache ?? false,
        cachedAt: (r as any).cacheAt ?? null,
    };
}

export async function getCatalogWithMemoryFallback(opts:{refresh?: boolean} = {}) {
    const {refresh = false} = opts;
    if(!refresh && hasFreshCastalog()){
        return{
            onus: catalogState.onus,
            source: "cache" as const,
            updatedAt: catalogState.updatedAt,
            expiresAt: catalogState.expiresAt,
            stale: false,
        }
    }
    if(isInCooldown() && hasAnyCatalog()){
        return{
            onus: catalogState.onus,
            source: "cache" as const,
            updatedAt: catalogState.updatedAt,
            expiresAt: catalogState.expiresAt,
            stale: true,
            reason: "SmartOlt esta en cooldown por hourly limit"
        }
    }

    try{
        return await refreshCatalogFromSmartOlt();
    }catch(err:any){
        if(hasAnyCatalog()){
            return{
                onus: catalogState.onus,
                source:  "cache" as const,
                updatedAt: catalogState.updatedAt,
                expiresAt: catalogState.expiresAt,
                stale: true,
                reason: String(err?.message ?? err)
            }
        }
        throw err;
    }
}