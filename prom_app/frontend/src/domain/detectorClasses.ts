export const detectorAdapterVersion = 'legacy-demo-to-catalog-1';
export const detectorLabels: Record<string, string> = {
  aerial_platform: 'Подъёмная рабочая платформа',
  asphalt_paver: 'Асфальтоукладчик',
  bulldozer: 'Бульдозер',
  concrete_mixer_truck: 'Автобетоносмеситель',
  concrete_paver: 'Бетоноукладчик',
  concrete_pump: 'Бетононасос',
  crane: 'Подъёмный кран',
  drilling_rig: 'Буровая установка',
  dump_truck: 'Самосвал',
  excavator: 'Экскаватор',
  grader: 'Автогрейдер',
  hdd_rig: 'Установка ГНБ',
  loader: 'Погрузчик',
  piling_rig: 'Сваепогружающая установка',
  pipelayer: 'Трубоукладчик',
  roller: 'Каток',
  track_layer: 'Путеукладчик',
  truck: 'Грузовой автомобиль',
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
  return Object.hasOwn(legacyAliases, id) ? legacyAliases[id] : id;
}
export function detectorLabel(id: string) {
  const normalized = detectorClass(id);
  return Object.hasOwn(detectorLabels, normalized) ? detectorLabels[normalized] : 'Неизвестный класс: ' + id;
}
