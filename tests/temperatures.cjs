// SPDX-License-Identifier: MIT
// Run with Node.js, Playwright and Chrome installed.
const assert = require('node:assert/strict');
const path = require('node:path');
const {chromium} = require('playwright');

async function run() {
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  try {
    const page = await browser.newPage();
    await page.setContent('<main></main>');
    await page.addScriptTag({path: process.argv[2] || path.join(__dirname, '../dist/truma-inet-dashboard.js')});
    await page.evaluate(() => {
      window.loadCardHelpers = async () => ({createCardElement: () => document.createElement('div')});
    });
    for (const [kind, current, legacy] of [
      ['climate', 'sensor.truma_inet_current_temperature', 'sensor.truma_inet_raumtemperatur'],
      ['water', 'sensor.truma_inet_water_temperature', 'sensor.truma_inet_wassertemperatur']
    ]) {
      const read = (preferred, readings, control = 'unavailable', unit = '°C') =>
        page.evaluate(({kind, preferred, readings, control, unit}) => {
          const main = document.querySelector('main');
          const card = document.createElement('camper-inet-card');
          main.replaceChildren(card);
          card.setConfig({kind, entity: 'test.control', temperature_entity: preferred});
          const states = {};
          if (control) states['test.control'] = {state: control, attributes: {temperature: 19}};
          for (const [id, state] of Object.entries(readings)) {
            states[id] = {state, attributes: {unit_of_measurement: unit}};
          }
          card.hass = {states, config: {}, locale: {language: 'de-DE'}};
          return ['value-a', 'note-a', 'value-b'].map(id => card.shadowRoot.getElementById(id).textContent);
        }, {kind, preferred, readings, control, unit});
      const both = {[current]: '21', [legacy]: '18'};
      const measured = value => [value, 'Gemessen', '—'];
      const missing = ['—', 'Nicht verfügbar', '—'];
      assert.deepEqual(await read(null, both), measured('21 °C'));
      assert.deepEqual(await read(null, {[legacy]: '0'}), measured('0 °C'));
      assert.deepEqual(await read(legacy, both), measured('18 °C'));
      assert.deepEqual(await read(legacy, {[current]: '12'}), measured('12 °C'));
      assert.deepEqual(await read(current, {[current]: 'unknown', [legacy]: '7'}), measured('7 °C'));
      assert.deepEqual(await read('sensor.my_probe', {...both, 'sensor.my_probe': '68.5'}, null, '°F'), measured('68,5 °F'));
      assert.deepEqual(await read('sensor.my_probe', both), missing);
      for (const state of ['unavailable', 'unknown', ' ', 'NaN', 'Infinity']) {
        assert.deepEqual(await read(null, {[current]: state}), missing);
      }
      const control = kind === 'climate' ? 'heat' : 'Niedrig';
      assert.deepEqual(await read(null, both, control), ['21 °C', 'Gemessen', kind === 'climate' ? '19 °C' : control]);
    }
  } finally {
    await browser.close();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
