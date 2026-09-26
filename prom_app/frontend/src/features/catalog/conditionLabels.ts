export const conditionLabels: Record<string, string> = {
  concrete_compaction: 'Уплотнение бетона',
  concrete_delivery_to_form: 'Подача бетона',
  concrete_placement: 'Способ бетонирования',
  demolition_method: 'Способ демонтажа',
  excavation_method: 'Разработка грунта',
  fill_method: 'Устройство насыпи',
  ground_improvement_method: 'Закрепление грунта',
  pavement_material: 'Материал покрытия',
  pile_method: 'Технология свай',
  pipe_joint: 'Соединение труб',
  retaining_method: 'Ограждение котлована',
  rubber_surface: 'Резиновое покрытие',
  site_metal_joint: 'Соединение металла',
  soil_transport: 'Перемещение грунта',
  tunnelling_method: 'Проходка тоннеля',
  utility_installation_method: 'Прокладка сети',
  waterproofing_joint: 'Соединение гидроизоляции',
};
export const valueLabels: Record<string, string> = {
  vibration: 'Вибрирование',
  pump: 'Бетононасосом',
  cast_in_place: 'Монолитное бетонирование',
  demolition_excavator: 'Экскаватором-разрушителем',
  excavator: 'Экскаватором',
  mechanically_compacted_layers: 'Послойное механизированное уплотнение',
  injection: 'Инъектирование',
  jet_grouting: 'Струйная цементация',
  compactable_asphalt: 'Уплотняемая асфальтобетонная смесь',
  bored: 'Буронабивные сваи',
  impact_driven: 'Забивные сваи',
  pressed: 'Вдавливаемые сваи',
  polymer_butt_fusion: 'Стыковая сварка полимерных труб',
  press_fit: 'Пресс-соединения',
  bored_pile_wall: 'Буросвайное ограждение',
  diaphragm_wall: 'Стена в грунте',
  in_situ_mixed_seamless: 'Бесшовное покрытие, смешивание на месте',
  welded: 'Сварка',
  dump_truck_haulage: 'Вывоз самосвалами',
  shield_tbm_segment_lining: 'Щитовая проходка ТПМК',
  hdd: 'Горизонтально-направленное бурение',
  hot_air_welded_polymer: 'Сварка полимера горячим воздухом',
  other: 'Другой метод / условие не выполняется',
};
export function conditionName(key: string) {
  return Object.hasOwn(conditionLabels, key) ? conditionLabels[key] : key;
}
export function valueName(key: string) {
  return Object.hasOwn(valueLabels, key) ? valueLabels[key] : key;
}
