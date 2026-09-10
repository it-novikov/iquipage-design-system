// Local integration smoke test. Uses a fresh browser context and synthetic data.
// No personal browser profile, third-party requests, credentials or production API.
import {mkdir, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const origin = new URL(process.env.MAPS_TEST_URL || 'http://127.0.0.1:4331').origin;
if (!['127.0.0.1', 'localhost'].includes(new URL(origin).hostname)) throw Error('Local test origin required');
const modulePath = process.env.MAPS_PLAYWRIGHT_MODULE;
const {chromium} = await import(modulePath ? pathToFileURL(modulePath).href : 'playwright');
const browser = await chromium.launch({headless:true, ...(process.env.MAPS_CHROMIUM_PATH ? {executablePath:process.env.MAPS_CHROMIUM_PATH} : {})});
const context = await browser.newContext({viewport:{width:1440,height:900}});
await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
const page = await context.newPage(); const errors=[];
page.on('pageerror', error => errors.push(error.message));
await mkdir('artifacts/r3',{recursive:true});
try {
  await page.goto(origin);
  await page.getByRole('heading',{name:'Доска задач',exact:true}).waitFor();
  await page.screenshot({path:'artifacts/r3/tasks.png'});
  console.log('Task board:', await page.locator('.kanban-column-header h3').allTextContents());
  await page.getByRole('link',{name:'Карты',exact:true}).click();
  await page.locator('iq-whiteboard').waitFor();
  await page.screenshot({path:'artifacts/r3/maps.png'});
  console.log('Map:', (await page.locator('body').innerText()).slice(0,1800));
  await writeFile('artifacts/r3/smoke.json',JSON.stringify({errors,origin},null,2));
  if(errors.length)throw Error(errors.join('\n'));
} finally { await browser.close(); }
