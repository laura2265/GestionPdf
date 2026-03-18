type OpenCageResult = {
    lat: number;
    lng: number;
    label: string;
    confidence: number | null;
    components: Record<string, any>
}

function normalizeBogotaQuery(raw: string){
    let q = raw.trim();

    q = q.replace(/\s+/g, " ");
    q = q.replace(/\b(cra|cr)\b/gi, "Carrera");
    q = q.replace(/\b(cl)\b/gi, "Calle");
    q = q.replace(/\b(av)\b/gi, "Avenida");
    q = q.replace(/\b(tv|trv|trans)\b/gi, "Transversal");

    q = q.replace(/#\s*/g, "# ");
    q = q.replace(/\s*-\s*/g, "-");

    if(!/bogota[aá]/i.test(q)) q += " Bogotá";
    if(!/colombia/i.test(q)) q += " Colombia";

    return q;
}

