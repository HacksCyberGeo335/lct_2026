import { createServer } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ root, server: { middlewareMode: true, watch: null } });
try {
  const { projects } = await server.ssrLoadModule('/src/demo/data.ts');
  const { detectionsAt } = await server.ssrLoadModule('/src/demo/observations.ts');
  const output = path.join(root, 'public/inspection');
  await mkdir(output, { recursive: true });
  const project = projects[0];
  const descriptions = [
    { name: 'pit-missing.png', camera: 1, time: 0, zone: 'А', label: 'Котлован: не хватает самосвалов' },
    {
      name: 'pit-unexpected.png',
      camera: 1,
      time: 15,
      zone: 'А',
      label: 'Котлован: лишний кран и нехватка самосвалов',
    },
    { name: 'pit-ok.png', camera: 2, time: 15, zone: 'А', label: 'Котлован: техника по плану' },
    { name: 'foundation-ok.png', camera: 3, time: 15, zone: 'Б', label: 'Фундамент: другая зона' },
  ];
  const frames = [];
  for (const item of descriptions) {
    const target = path.join(output, item.name);
    const ffmpeg = spawnSync('ffmpeg', [
      '-y',
      '-loglevel',
      'error',
      '-ss',
      String(item.time),
      '-i',
      path.join(root, 'public/media/north-park-' + item.camera + '.webm'),
      '-frames:v',
      '1',
      target,
    ]);
    if (ffmpeg.status !== 0) throw new Error('ffmpeg: ' + ffmpeg.stderr);
    const bytes = await readFile(target);
    const width = bytes.readUInt32BE(16),
      height = bytes.readUInt32BE(20);
    const image = {
      name: item.name,
      width,
      height,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
    const camera = project.cameras.find((c) => c.id === String(item.camera));
    const result = {
      version: 1,
      image,
      captured_at: new Date(Date.parse('2026-08-25T14:19:22+03:00') + item.time * 1000).toISOString(),
      camera_id: camera.id,
      zone: item.zone,
      state: 'succeeded',
      model: 'Синтетический пример, не ML',
      quality: { usable: true, reason: '' },
      error: null,
      detections: detectionsAt(camera.boxes, item.time).map((d) => ({
        id: d.id,
        class_id: d.cls,
        confidence: d.confidence,
        bbox: [d.x, d.y, d.width, d.height],
      })),
    };
    await writeFile(path.join(output, item.name + '.json'), JSON.stringify(result, null, 2) + '\n');
    frames.push({
      id: 'demo-' + item.name,
      name: item.name,
      url: '/inspection/' + item.name,
      sha256: image.sha256,
      width,
      height,
      bytes: bytes.length,
      origin: 'demo',
      result,
      label: item.label,
    });
  }
  const stage = (id, name, start, end, zone, resources, parentId = 'construction') => ({
    id,
    name,
    start,
    end,
    zone,
    resources,
    parentId,
    rulePolicy: 'required-and-unexpected',
    equipment: null,
    quantity: null,
    actualStart: null,
    actualEnd: null,
    plan: null,
    fact: null,
  });
  const plan = [
    stage('construction', 'Строительно-монтажные работы', '2026-08-01', '2026-09-30', '', [], null),
    stage('pit', 'Разработка котлована', '2026-08-01', '2026-08-31', 'А', [
      { equipment: 'exc', quantity: 1 },
      { equipment: 'dump', quantity: 2 },
    ]),
    stage('foundation', 'Устройство фундамента', '2026-08-01', '2026-09-15', 'Б', [
      { equipment: 'mixer', quantity: 1 },
      { equipment: 'crane', quantity: 1 },
    ]),
    stage('frame', 'Монтаж каркаса', '2026-09-01', '2026-09-30', 'А', [{ equipment: 'crane', quantity: 1 }]),
  ];
  await writeFile(path.join(output, 'manifest.json'), JSON.stringify({ frames, plan }, null, 2) + '\n');
  console.log('Generated four synthetic PNG images, bound JSON results and a hierarchical plan.');
} finally {
  await server.close();
}
