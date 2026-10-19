import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fillBidForm } from '../src/proposal';

/*
 * Imita o jquery.price_format do formulário real: o keydown bloqueia qualquer tecla que não seja
 * dígito/edição (inclusive o "A" do Cmd/Ctrl+A) e o keyup reformata o valor em centavos.
 * O site pré-preenche a oferta com o valor mínimo (data-min="5000" → "50,00").
 */
const html = `
<input type="tel" id="oferta" value="50,00">
<input type="tel" id="duracao-estimada" value="">
<textarea id="proposta"></textarea>
<script>
  const input = document.getElementById('oferta');
  const allowed = (k) => (k >= 48 && k <= 57) || (k >= 96 && k <= 105) || [8, 9, 13, 37, 39, 46].includes(k);
  const format = (v) => {
    const digits = v.replace(/\\D/g, '').replace(/^0+/, '').slice(0, 9).padStart(3, '0');
    const int = digits.slice(0, -2).replace(/\\B(?=(\\d{3})+(?!\\d))/g, '.');
    return int + ',' + digits.slice(-2);
  };
  input.addEventListener('keydown', (e) => { if (!allowed(e.keyCode)) e.preventDefault(); });
  input.addEventListener('keyup', () => { input.value = format(input.value); });
</script>`;

describe('fillBidForm', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch();
  });
  afterAll(() => browser?.close());

  // Página nova por caso: o script da máscara declara constantes globais
  beforeEach(async () => {
    page = await browser.newPage();
  });
  afterEach(() => page?.close());

  it.each([
    [1500, '1.500,00'],
    [1000.5, '1.000,50'],
    [50, '50,00'],
  ])('substitui o valor pré-preenchido por R$ %s', async (value, expected) => {
    await page.setContent(html);
    const error = await fillBidForm(page, { bidUrl: '', value, days: 12, message: 'Olá!' });

    expect(error).toBeNull();
    expect(await page.locator('#oferta').inputValue()).toBe(expected);
    expect(await page.locator('#duracao-estimada').inputValue()).toBe('12');
    expect(await page.locator('#proposta').inputValue()).toBe('Olá!');
  });
});
