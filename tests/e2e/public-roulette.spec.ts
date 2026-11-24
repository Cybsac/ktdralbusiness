import { test, expect, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { ROULETTE_CONFIG } from '../../src/lib/experiences/roulette-config';

// Browser isolation: bundle the actual public client and its real components,
// with only the Next navigation adapter and HTTP boundary replaced by fixtures.
// No server, production database or issued token is used in this suite.
const ORIGIN = 'https://roulette.fixture.test';
const FIXTURE_PRIZE = { id: 'fixture-prize', key: 'prize', label: 'Premio de prueba', color: '#b87920', active: true };
const FIXTURE_LOSE = { id: 'fixture-lose', key: 'lose', label: 'Sin premio', color: '#303030', active: true };
const FIXTURE_RETRY = { id: 'fixture-retry', key: 'retry', label: 'Reintento', color: '#804020', active: true };
const FIXTURE_TIME = '2030-01-01T12:00:00.000Z';
type Action = 'PRIZE' | 'LOSE' | 'RETRY';

function fixture(id: string, action: Action, type = 'roulette', restored = false) {
  const prize = action === 'LOSE' ? FIXTURE_LOSE : action === 'RETRY' ? FIXTURE_RETRY : FIXTURE_PRIZE;
  return {
    token: { id, timeZone: 'America/Lima', batchId: 'fixture-batch', expiresAt: '2099-01-01T00:00:00.000Z', revealedAt: restored ? FIXTURE_TIME : null, redeemedAt: null, deliveredAt: null, disabled: false, availableFrom: null, availability: 'AVAILABLE', experienceType: type, reservedByRetry: false, action, continuation: restored && action === 'RETRY' ? { tokenId: 'second', state: 'READY' } : null, prize },
    elements: [FIXTURE_PRIZE, FIXTURE_LOSE, FIXTURE_RETRY].map(p => ({ prizeId: p.id, key: p.key, label: p.label, color: p.color, count: 1 })),
  };
}

let script: string;
let css: string;
test.use({ browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, launchOptions: { executablePath: process.env.ROULETTE_BROWSER_EXECUTABLE } });

test.beforeAll(async () => {
  const bundle = await build({
    stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
      import React from 'react'; import { createRoot } from 'react-dom/client';
      import RouletteClientPage from './src/app/marketing/ruleta/RouletteClientPage';
      import { RouletteThemeProvider } from './src/components/theme/RouletteThemeProvider';
      function FixtureApp(){
        const [id,setId]=React.useState(window.__firstToken);
        window.__navigate=(path)=>{ const url=new URL(path,location.href); history.replaceState(null,'',url); setId(url.searchParams.get('tokenId')); };
        return <RouletteThemeProvider initialTheme='default'><RouletteClientPage key={id} tokenId={id} theme='default' initial={{data:window.__fixtures[id]}}/></RouletteThemeProvider>;
      }
      createRoot(document.getElementById('root')).render(<FixtureApp/>);
    ` },
    bundle: true, write: false, outdir: 'fixture-output', format: 'iife', jsx: 'automatic', loader: { '.css': 'local-css' },
    plugins: [{ name: 'fixture-next', setup(builder) {
      builder.onResolve({ filter: /^next\/(navigation|dynamic)$/ }, args => ({ path: args.path, namespace: 'fixture-next' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture-next' }, args => args.path === 'next/navigation'
        ? { contents: `export function useRouter(){return {replace:(path)=>window.__navigate(path)}}`, loader: 'js' }
        : { contents: `import React from 'react'; export default function dynamic(loader){const Lazy=React.lazy(()=>loader().then(m=>typeof m==='function'?{default:m}:m));return function Dynamic(props){return React.createElement(React.Suspense,{fallback:null},React.createElement(Lazy,props))}}`, loader: 'js', resolveDir: process.cwd() });
    }}],
  });
  script = bundle.outputFiles.find(file => file.path.endsWith('.js'))!.text;
  css = bundle.outputFiles.find(file => file.path.endsWith('.css'))?.text ?? '';
});

async function openGame(page: Page, first: ReturnType<typeof fixture>, next?: ReturnType<typeof fixture>, failReveal = false) {
  const fixtures = { [first.token.id]: first, ...(next ? { [next.token.id]: next } : {}) };
  const reveals: string[] = [];
  let initialReads = 0;
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) return route.abort();
    if (route.request().isNavigationRequest()) return route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div>' });
    if (url.pathname.endsWith('/roulette-data')) initialReads++;
    if (url.pathname.endsWith('/reveal')) {
      const id = url.pathname.split('/')[3];
      reveals.push(id);
      if (failReveal) return route.fulfill({ status: 503, json: { code: 'GAME_FAILED', message: 'No se pudo confirmar la jugada.' } });
      const token = fixtures[id].token;
      return route.fulfill({ json: { action: token.action, prizeId: token.prize.id, timestamps: { revealedAt: FIXTURE_TIME }, nextTokenId: token.action === 'RETRY' ? next?.token.id : null, continuation: token.action === 'RETRY' ? { tokenId: next?.token.id, state: 'READY' } : null } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto(`${ORIGIN}/r/${first.token.id}`);
  await page.addStyleTag({ content: css });
  await page.evaluate(({ fixtures, firstId }) => Object.assign(window, { __fixtures: fixtures, __firstToken: firstId }), { fixtures, firstId: first.token.id });
  await page.addScriptTag({ content: script });
  return { reveals, get initialReads() { return initialReads; } };
}

test('normal prize under mobile CPU throttling, with no initial API waterfall', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const state = await openGame(page, fixture('first', 'PRIZE'));
  await page.evaluate(() => {
    const times: number[] = []; let frame = 0;
    const measure = (now: number) => { if (document.querySelector('[data-moving="true"]')) times.push(now); frame = requestAnimationFrame(measure); };
    frame = requestAnimationFrame(measure);
    Object.assign(window, { __frameSample: () => { cancelAnimationFrame(frame); return times; } });
  });
  await page.getByRole('button', { name: 'Girar la ruleta' }).click();
  const modal = page.getByRole('dialog', { name: '¡Bien hecho!' });
  await expect(modal.getByText(FIXTURE_PRIZE.label)).toBeVisible({ timeout: ROULETTE_CONFIG.motion.durationMs + 10_000 });
  const times = await page.evaluate(() => (window as any).__frameSample() as number[]);
  const gaps = times.slice(1).map((time, index) => time - times[index]).sort((a, b) => a - b);
  if (gaps.length) console.log(`Wheel frame sample: ${gaps.length} frames, median ${gaps[Math.floor(gaps.length / 2)].toFixed(1)}ms, p95 ${gaps[Math.floor(gaps.length * .95)].toFixed(1)}ms (emulated CPU 4x)`);
  await modal.getByRole('button', { name: 'Cerrar' }).click();
  await expect(page.getByText('Premio revelado', { exact: true })).toBeVisible();
  expect(state.reveals).toEqual(['first']);
  expect(state.initialReads).toBe(0);
});

test('lose and reduced-motion path', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const state = await openGame(page, fixture('first', 'LOSE'));
  await page.getByRole('button', { name: 'Girar la ruleta' }).click();
  await expect(page.getByRole('dialog').getByText('No has ganado premio esta vez.')).toBeVisible();
  expect(state.reveals).toEqual(['first']);
});

test('retry preserves a second manual play', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const state = await openGame(page, fixture('first', 'RETRY'), fixture('second', 'PRIZE'));
  await page.getByRole('button', { name: 'Girar la ruleta' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('button', { name: 'Girar la ruleta' })).toBeVisible();
  expect(state.reveals).toEqual(['first']);
  await page.getByRole('button', { name: 'Girar la ruleta' }).click();
  await expect(page.getByRole('dialog', { name: '¡Bien hecho!' })).toBeVisible();
  expect(state.reveals).toEqual(['first', 'second']);
});

test('restores a revealed prize without another play', async ({ page }) => {
  const state = await openGame(page, fixture('first', 'PRIZE', 'roulette', true));
  await expect(page.getByText('Premio revelado', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Girar la ruleta' })).toHaveCount(0);
  expect(state.reveals).toEqual([]);
  expect(state.initialReads).toBe(0);
});

test('scratch completes a touch reveal using its own interaction surface', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const state = await openGame(page, fixture('first', 'PRIZE', 'scratch_card'));
  const canvas = page.locator('canvas[aria-label]');
  await expect(canvas).toBeVisible();
  await expect(page.getByRole('button', { name: 'Girar la ruleta' })).toHaveCount(0);
  await canvas.scrollIntoViewIfNeeded();
  await canvas.evaluate(el => { el.style.touchAction = 'none'; });
  const box = (await canvas.boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const x1 = box.x + box.width * .08, x2 = box.x + box.width * .92;
  const top = box.y + box.height * .08;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y: top }] });
  for (let row = 0; row < 7 && !state.reveals.length; row++) {
    const y = top + box.height * .13 * row;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: row % 2 ? x2 : x1, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: row % 2 ? x1 : x2, y }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByRole('dialog', { name: '¡Bien hecho!' })).toBeVisible({ timeout: 10_000 });
  expect(state.reveals).toEqual(['first']);
  expect(state.initialReads).toBe(0);
});

test('an ambiguous reveal failure is never retried automatically', async ({ page }) => {
  const state = await openGame(page, fixture('first', 'PRIZE'), undefined, true);
  await page.getByRole('button', { name: 'Girar la ruleta' }).click();
  await expect(page.getByText('No se pudo confirmar la jugada.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Intentar de nuevo' })).toBeVisible();
  expect(state.reveals).toEqual(['first']);
});
