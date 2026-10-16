// -----------------------------------------------------------------------------
// The station widget: valid against the core vocabulary and budget, bound to
// features that exist, localized, with a readable empty state.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { FIXTURES, TOKEN } from './helpers/fakeTempest.js';
import { addStation, createWorld, flush } from './helpers/world.js';

async function liveWorld() {
  const world = await createWorld();
  await addStation(world);
  world.cloud.socket.accept();
  world.cloud.socket.push(FIXTURES.websocket.obs_st);
  world.cloud.socket.push(FIXTURES.websocket.evt_strike);
  await flush();
  return world;
}

const stationDevice = (gladys) => gladys.externalIds('station', '20001').device;

async function content(world, request) {
  const ack = await world.gladys.fake.widgetGet('station', request);
  assert.equal(ack.success, true, ack.error);
  return ack.data.content;
}

for (const view of ['daily', 'hourly']) {
  for (const [language, units] of [
    ['en', 'metric'],
    ['fr', 'metric'],
    ['de', 'metric'],
    ['es', 'metric'],
    ['en', 'us'],
  ]) {
    test(`the ${view} content is valid and bound to real features (${language}, ${units})`, async () => {
      const world = await liveWorld();
      const widget = await content(world, {
        settings: { device: stationDevice(world.gladys), forecast: view },
        language,
        units,
      });
      assert.deepEqual(validateWidgetContent(widget), []);
      const features = new Set(
        world.gladys.fake.discoveredDevices[0].features.map((f) => f.external_id),
      );
      for (const component of widget.components) {
        if (component.device_feature) {
          assert.ok(features.has(component.device_feature), component.device_feature);
        }
      }
      const list = widget.components.find((c) => c.type === 'card-list');
      assert.equal(list.items.length, view === 'daily' ? 5 : 8);
      const status = widget.components.find((c) => c.type === 'status');
      assert.ok(status.items.some((item) => item.icon === 'zap' && /13 km|8 mi/.test(item.value)));
      world.app.stop();
    });
  }
}

test('the forecast list is localized in the station time zone', async () => {
  const world = await liveWorld();
  const widget = await content(world, {
    settings: { device: stationDevice(world.gladys) },
    language: 'fr',
    units: 'metric',
  });
  const list = widget.components.find((c) => c.type === 'card-list');
  // 2023-12-28 in Denver is a Thursday.
  assert.equal(list.items[0].title, 'Jeudi');
  assert.equal(list.items[0].subtitle, 'Dégagé · -6° / 5° · 0 %');
  const us = await content(world, {
    settings: { device: stationDevice(world.gladys) },
    language: 'en',
    units: 'us',
  });
  assert.equal(
    us.components.find((c) => c.type === 'card-list').items[0].subtitle,
    'Clear · 21° / 41° · 0 %',
  );
  world.app.stop();
});

test('empty states: not configured, no station picked, a station removed', async () => {
  const unconfigured = await createWorld({ config: {} });
  let widget = await content(unconfigured, { settings: {}, language: 'de' });
  assert.match(widget.components[0].text, /Zugriffstoken/);
  assert.deepEqual(validateWidgetContent(widget), []);
  unconfigured.app.stop();

  const world = await createWorld({ config: { token: TOKEN } });
  widget = await content(world, { settings: {}, language: 'es' });
  assert.match(widget.components[0].text, /Elija una estación/);
  widget = await content(world, {
    settings: { device: stationDevice(world.gladys) },
    language: 'en',
  });
  assert.match(widget.components[0].text, /no longer in Gladys/);
  world.app.stop();
});

test('a station added but not observed yet still shows its forecast', async () => {
  const world = await createWorld();
  world.cloud.failures['observations'] = 'down';
  await addStation(world);
  const widget = await content(world, {
    settings: { device: stationDevice(world.gladys) },
    language: 'en',
  });
  assert.deepEqual(validateWidgetContent(widget), []);
  assert.ok(widget.components.some((c) => c.type === 'card-list'));
  world.app.stop();
});
