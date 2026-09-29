/** Dataset IDs supplied by CV_Detector_Filter in the updated knowledge base. */
export const datasetClasses = [
  'excavator',
  'dump_truck',
  'truck',
  'crane',
  'loader',
  'concrete_mixer_truck',
  'bulldozer',
  'trailer',
  'roller',
  'concrete_pump',
] as const;
export const detectorAdapterVersion = 'dataset-10-classes-2026-09-29';
export const detectorLabels: Record<string, string> = {
  excavator: 'Экскаватор',
  dump_truck: 'Самосвал',
  truck: 'Грузовой автомобиль',
  crane: 'Кран',
  loader: 'Фронтальный погрузчик',
  concrete_mixer_truck: 'Автобетоносмеситель',
  bulldozer: 'Бульдозер',
  trailer: 'Прицеп',
  roller: 'Каток',
  concrete_pump: 'Автобетононасос',
};
const legacyAliases: Record<string, string> = {
  exc: 'excavator',
  dump: 'dump_truck',
  dozer: 'bulldozer',
  mixer: 'concrete_mixer_truck',
  mobile_crane: 'crane',
  manipulator: 'crane',
};
export function detectorClass(id: string) {
  if (/^[0-9]$/.test(id)) return datasetClasses[Number(id)];
  return Object.hasOwn(legacyAliases, id) ? legacyAliases[id] : id;
}
export function detectorLabel(id: string) {
  const normalized = detectorClass(id);
  return Object.hasOwn(detectorLabels, normalized) ? detectorLabels[normalized] : 'Неизвестный класс: ' + id;
}
