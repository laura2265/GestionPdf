export const FILE_KINDS = [
    "FOTO_FACHADA",
    "FOTO_NOMENCLATURA",
    "FOTO_TEST_VELOCIDAD",
    "ORDEN_TRABAJO"
]as const; 

export type FileKind = typeof FILE_KINDS[number];

export function normalizeKind(input: string): FileKind {
    switch(input){
        case "CAPTURA": 
        case "CAPTURA_TEST":
            return "FOTO_TEST_VELOCIDAD"
        default: 
        return input as FileKind
    }
}