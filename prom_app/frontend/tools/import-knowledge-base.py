"""Read the supplied workbook without executing formulas or macros; rebuild frontend assets.
Usage: python tools/import-knowledge-base.py /path/to/knowledge-base.xlsx
Requires openpyxl for read-only workbook extraction.
"""
import hashlib
import json
import re
import sys
from pathlib import Path
import openpyxl

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(sys.argv[1])
source_hash = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
wb = openpyxl.load_workbook(SOURCE, data_only=True, read_only=True)
def rows(sheet):
    values = wb[sheet].iter_rows(values_only=True)
    headers = next(values)
    return [dict(zip(headers, row)) for row in values if row[0] is not None]
def keyed(sheet):
    result = {}
    for row in rows(sheet):
        key = row['work_id']
        if re.fullmatch(r'work_\d+', str(key)):
            assert key not in result, (sheet, key)
            result[key] = row
    return result

def text(value):
    return str(value or '').strip()
def parse(value, default):
    return json.loads(value) if value else default

classes = [
 ('excavator','Экскаватор'),('dump_truck','Самосвал'),('truck','Грузовой автомобиль'),
 ('crane','Кран'),('loader','Фронтальный погрузчик'),('concrete_mixer_truck','Автобетоносмеситель'),
 ('bulldozer','Бульдозер'),('trailer','Прицеп'),('roller','Каток'),('concrete_pump','Автобетононасос')]
def class_id(value):
    i = int(value)
    assert 0 <= i < len(classes)
    return classes[i][0]
work_rows = keyed('Works')
cv = keyed('CV_Work_Methodology')
allowed = keyed('CV_Detector_Filter')
assert len(allowed) == 94 and set(work_rows) == set(cv) == set(allowed)
relations = rows('Equipment_Relations')
assert all(r['work_id'] in allowed for r in relations)
sources = {r['source_id']:r for r in rows('Sources')}
used_sources = set()
works = []
cards = []
categories = {}
durations = []
for wid, method in cv.items():
    original = work_rows[wid]
    name = text(method['Этап / вид работ'])
    category = original['work_group']
    categories[category] = text(method['Группа работ'])
    ids = [class_id(i.strip()) for i in str(allowed[wid]['ID классов (data.yaml)']).split(',')]
    own = [r for r in relations if r['work_id'] == wid]
    assert set(ids) == {class_id(r['equipment_id']) for r in own}, wid
    groups, possible = [], []
    for r in own:
        machine = class_id(r['equipment_id'])
        source_ids = parse(r['source_ids_json'], [])
        used_sources.update(source_ids)
        assert all(s in sources for s in source_ids)
        if r['relation_type'] in ('REQUIRES','CONDITIONAL'):
            alternatives = [class_id(i) for i in parse(r['one_of_json'], [r['equipment_id']])]
            assert all(i in ids for i in alternatives)
            groups.append(dict(requirement_id=r['requirement_id'], relation=r['relation_type'],
                functional_equipment_id=machine,equipment_name_ru=text(r['equipment_name']),one_of=alternatives,
                phase=text(r['requirement_phase']),when=parse(r['requirement_when_json'], {}),
                condition=text(r['condition']),rationale=text(r['rationale']),evidence_level=text(r['evidence_level']),
                source_ids=source_ids,alternatives_exhaustive=bool(r['alternatives_exhaustive']),
                alternative_selection=text(r['alternative_selection'])))
        else:
            assert r['relation_type'] in ('MAY_USE','EXPECTED')
            possible.append(dict(equipment_id=machine,equipment_name_ru=text(r['equipment_name']),
                equipment_name_en=machine,relation=r['relation_type'],condition=text(r['condition']),
                evidence_level=text(r['evidence_level']),source_ids=source_ids))
    assert len({g['requirement_id'] for g in groups}) == len(groups), wid
    required = [g for g in groups if g['relation']=='REQUIRES']
    conditional = [g for g in groups if g['relation']=='CONDITIONAL']
    labels = [dict(class_id=c,name_ru=classes[int(i.strip())][1],name_en=c)
        for c,i in zip(ids,str(allowed[wid]['ID классов (data.yaml)']).split(','))]
    works.append(dict(work_id=wid,work_name=name,canonical_work_name=name,row_kind='ITEM',
        equipment_classes=labels,detector_classes=labels,required_equipment=required,
        conditional_required_equipment=conditional,possible_equipment=possible,
        requirement_status='FUNCTIONAL_REQUIREMENT_IDENTIFIED' if required else 'CONDITIONAL_ON_METHOD' if conditional else 'NO_UNIVERSAL_MACHINE_IDENTIFIED',
        review_notes=[],cctv=dict(requires_project_configuration=True,automatic_absence_alert_enabled=False,
            reason='Наблюдаемая техника не подтверждает выполнение работы без условий и истории наблюдений.',
            candidate_detector_classes=ids,external_view_limitation=text(method['Комментарий / ограничения']))))
    row_number = list(cv).index(wid)+2
    cards.append(dict(id=wid,work_name=name,canonical_work_name=name,row_kind='ITEM',macro_stage=category,
        applicable_object_types=[],source=dict(row=row_number,cell='B'+str(row_number),context=[text(method['Подгруппа'])]),
        external_camera_observability=float(method['CV_confidence_score'])/100,
        observability_note=text(method['Наблюдаемость компьютерным зрением']),
        positive_visual_signs=[text(method['Что именно видно на камере'])],predecessor='UNKNOWN',successor='UNKNOWN',
        visual_criteria=dict(not_started=text(method['NOT_STARTED']),start=text(method['Критерий начала этапа']),
            progress=text(method['Критерий выполнения / прогресса']),completion=text(method['Критерий завершения этапа']),
            limitations=text(method['Комментарий / ограничения']),duration_status=text(method['Статус расчёта']))))
    durations.append(dict(work_id=wid,work_name=name,row_kind='ITEM',benchmarks=[],
        review=text(method['Уровень доверия к длительности']),missing_inputs=text(method['Исходные данные для расчёта']),verified_population_mean=None))

def source_record(sid):
    s=sources[sid]
    return dict(id=sid,title=text(s['title']),url=text(s['url']),locator=text(s.get('review_locator')))
assets = {
 'cards': ('construction_work_cards.json',dict(schema_version='3.1-reviewed',source=dict(sha256=source_hash,card_count=len(cards)),macro_stage_definitions=categories,cards=cards)),
 'equipment': ('construction_work_equipment.json',dict(schema_version='1.1',source=dict(sha256=source_hash),works=works,
    equipment_ontology=[dict(id=c,name_ru=n,name_en=c,aliases=[],kind='MOBILE_MACHINE',cctv_visibility='HIGH',detector_classes=[c]) for c,n in classes],
    detector_class_catalog=[dict(class_id=c,name_ru=n,name_en=c) for c,n in classes],sources=[source_record(s) for s in sorted(used_sources)])),
 'durations': ('construction_work_duration_review.json',dict(schema_version='1.0',works=durations,benchmarks=[],sources=[]))}
manifest = dict(version=1,id='construction-cv-'+source_hash[:12],reviewed_on='2026-09-27',
    source_file=SOURCE.name,source_sha256=source_hash,files={})
for role,(filename,data) in assets.items():
    content=(json.dumps(data,ensure_ascii=False,indent=2)+'\n').encode('utf-8')
    (ROOT/'public/catalog'/filename).write_bytes(content)
    manifest['files'][role]=dict(file=filename,sha256=hashlib.sha256(content).hexdigest(),bytes=len(content),schema_version=data['schema_version'])
(ROOT/'public/catalog/manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
(ROOT/'public/catalog/plan-example.csv').write_text('id,parent_id,name,start,end,zone,work_id,catalog_id\npit,,Устройство котлована,2026-08-01,2026-08-31,А,work_047,'+manifest['id']+'\n',encoding='utf-8',newline='\n')
print(json.dumps(dict(works=len(cards),classes=len(classes),conditional=sum(len(w['conditional_required_equipment']) for w in works),possible=sum(len(w['possible_equipment']) for w in works),id=manifest['id']),ensure_ascii=True))
