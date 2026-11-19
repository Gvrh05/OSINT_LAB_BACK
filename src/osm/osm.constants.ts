export const CATEGORY_MAP: Record<string, string[]> = {
  salud: ['hospital', 'clinic', 'doctors', 'dentist', 'pharmacy'],
  educacion: ['school', 'kindergarten', 'college', 'university'],
  emergencia: ['fire_station', 'police'],
  combustible: ['fuel'],
  banco: ['bank', 'atm'],
  supermercado: ['supermarket'],
  culto: ['place_of_worship'],
};

export const CATEGORY_LABELS: Record<string, string> = {
  salud: 'Salud y farmacia',
  educacion: 'Educación',
  emergencia: 'Bomberos / Policía',
  combustible: 'Gasolineras',
  banco: 'Bancos / Cajeros',
  supermercado: 'Supermercados',
  culto: 'Lugares de culto',
  otros: 'Otros',
};