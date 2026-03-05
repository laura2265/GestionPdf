const onuKey = (o: any) => String(o?.unique_external_id ?? o?.sn ?? "").trim();
export function getExternalId(o: any): string | null {
  // Preferimos unique_external_id; si no existe, usamos SN.
  const id = o?.unique_external_id ?? o?.onu_details?.unique_external_id ?? null;
  if (id) return String(id);
  const sn = o?.sn ?? o?.SN ?? null;
  return sn ? String(sn) : null;
}

export function uniqueExternalIds(list: any[]): string[] {
  return list
    .map(getExternalId)
    .filter((x): x is string => Boolean(x));
}