export type CatalogueCustomerRow = {
  volumeId: number | null;
  clientId: number;
};

export function groupDistinctCatalogueCustomers(
  rows: CatalogueCustomerRow[],
  programIdByVolume: ReadonlyMap<number, number>,
) {
  const byVolume = new Map<number, Set<number>>();
  const byProgram = new Map<number, Set<number>>();

  for (const row of rows) {
    if (row.volumeId === null) continue;
    const programId = programIdByVolume.get(row.volumeId);
    const volumeCustomers = byVolume.get(row.volumeId) ?? new Set<number>();
    volumeCustomers.add(row.clientId);
    byVolume.set(row.volumeId, volumeCustomers);

    if (programId !== undefined) {
      const programCustomers = byProgram.get(programId) ?? new Set<number>();
      programCustomers.add(row.clientId);
      byProgram.set(programId, programCustomers);
    }
  }

  return { byVolume, byProgram };
}
