import { chromium } from '@playwright/test';
import { mkdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1200 }, reducedMotion: 'reduce' });
const cameras = {
  'north-park': 3,
  'river-quarter': 2,
  'kindergarten-214': 1,
  'school-1517': 1,
  'ice-center': 1,
};
mkdirSync('public/media', { recursive: true });
for (const [id, count] of Object.entries(cameras)) {
  for (let camera = 1; camera <= count; camera++) {
    if (existsSync(resolve('public/media', id + '-' + camera + '.webm'))) continue;
    const folder = resolve('artifacts', 'frames', id + '-' + camera);
    mkdirSync(folder, { recursive: true });
    await page.goto('http://127.0.0.1:5173/objects/' + id + '?camera=' + camera + '&recording=sample-stills');
    await page.getByLabel('Время снимка').waitFor();
    await page.addStyleTag({
      content:
        '.media-host {width:800px!important;height:450px!important;aspect-ratio:16/9!important}.detection-overlay,.media-label{visibility:hidden!important}',
    });
    await page.evaluate(() => document.fonts.ready);
    for (let i = 0; i < 12; i++) {
      await page.getByLabel('Время снимка').fill(String(i * 5));
      await page
        .locator('.synthetic-scene')
        .screenshot({ path: resolve(folder, String(i).padStart(2, '0') + '.png'), animations: 'disabled' });
    }
    const output = resolve('public/media', id + '-' + camera + '.webm');
    const result = spawnSync(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-framerate',
        '1/5',
        '-i',
        resolve(folder, '%02d.png'),
        '-t',
        '60',
        '-vf',
        'scale=1280:720',
        '-r',
        '10',
        '-c:v',
        'libvpx-vp9',
        '-crf',
        '38',
        '-b:v',
        '0',
        '-pix_fmt',
        'yuv420p',
        output,
      ],
      { windowsHide: true, encoding: 'utf8' },
    );
    if (result.status !== 0) throw new Error(result.stderr);
    console.log('Generated ' + id + '-' + camera + '.webm');
  }
}
await browser.close();
