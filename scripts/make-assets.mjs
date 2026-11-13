// Gera ícones "maskable" e capturas de ecrã do manifest. Uso: node scripts/make-assets.mjs (com `npm run dev -- -p 3111` a correr)
import sharp from "sharp";
import { chromium } from "@playwright/test";

const BG = "#1a202c";
for (const size of [192, 512]) {
  const inner = Math.round(size * 0.62); // zona segura das máscaras
  const logo = await sharp("public/icon-512.png").resize(inner, inner).toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: logo, gravity: "center" }])
    .png().toFile(`public/icons/icon-maskable-${size}.png`);
  await sharp("public/icon-512.png").resize(size, size).png().toFile(`public/icons/icon-${size}.png`);
}

const books = Array.from({ length: 12 }, (_, i) => ({
  id: `b${i}`, drive_file_id: `b${i}`, title: ["O Livro do Desassossego", "Memorial do Convento", "Ensaio sobre a Cegueira", "Os Maias", "A Cidade e as Serras", "Mensagem", "Amor de Perdição", "Viagens na Minha Terra", "O Ano da Morte de Ricardo Reis", "Para Esta Noite", "Equador", "Levantado do Chão"][i],
  author: ["Fernando Pessoa", "José Saramago", "José Saramago", "Eça de Queirós", "Eça de Queirós", "Fernando Pessoa"][i % 6],
  series: null, series_index: null, language: "pt", publisher: null, isbn: null, description: null,
  cover_url: null, epub_url: null, filesize: 1e6, modified_at: null, created_at: null, updated_at: null,
}));
const browser = await chromium.launch();
async function shot(file, opts) {
  const ctx = await browser.newContext({ ...opts, serviceWorkers: "block" });
  const page = await ctx.newPage();
  await page.route("**/api/**", (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === "/api/books") return route.fulfill({ json: { books, total: 2390, page: 1, totalPages: 80 } });
    if (p === "/api/library/facets") return route.fulfill({ json: { authors: [], series: [], languages: [] } });
    if (p === "/api/auth/status") return route.fulfill({ json: { protected: false } });
    if (p.endsWith("/cover")) return route.fulfill({ status: 404 });
    return route.fulfill({ json: { state: {} } });
  });
  await page.goto("http://localhost:3111/");
  await page.waitForTimeout(2500);
  await page.screenshot({ path: file });
  await ctx.close();
}
await shot("public/icons/screenshot-desktop.png", { viewport: { width: 1280, height: 800 } });
await shot("public/icons/screenshot-mobile.png", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await browser.close();
