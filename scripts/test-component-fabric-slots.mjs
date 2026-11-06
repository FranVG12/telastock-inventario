import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = readFileSync(new URL('../lib/component-fabric-slots.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(compiled, { exports: module.exports, module });
const {
  componentFabricSlotLabel,
  isComponentFabricSlot,
  isComponentFabricSlotAvailableForModel,
  normalizeComponentFabricSlot,
  resolveComponentPieceTextileId,
  secondaryFabricSlotIndex,
} = module.exports;

test('normaliza vínculos directos antiguos a la tela principal', () => {
  assert.equal(normalizeComponentFabricSlot(undefined, 'textile-old-1'), 'principal');
  assert.equal(normalizeComponentFabricSlot('principal', 'textile-old-1'), 'principal');
  assert.equal(normalizeComponentFabricSlot('secundaria_2', 'textile-old-1'), 'secundaria_2');
  assert.equal(normalizeComponentFabricSlot(undefined, null), 'ninguna');
});

test('valida posiciones principales y secundarias sin aceptar índices inválidos', () => {
  assert.equal(isComponentFabricSlot('principal'), true);
  assert.equal(isComponentFabricSlot('ninguna'), true);
  assert.equal(isComponentFabricSlot('secundaria_1'), true);
  assert.equal(isComponentFabricSlot('secundaria_0'), false);
  assert.equal(isComponentFabricSlot('secundaria_01'), false);
  assert.equal(isComponentFabricSlot('secundaria_-1'), false);
  assert.equal(isComponentFabricSlot('secundaria_x'), false);
  assert.equal(isComponentFabricSlotAvailableForModel('principal', 0), true);
  assert.equal(isComponentFabricSlotAvailableForModel('ninguna', 0), true);
  assert.equal(isComponentFabricSlotAvailableForModel('secundaria_1', 1), true);
  assert.equal(isComponentFabricSlotAvailableForModel('secundaria_2', 2), true);
  assert.equal(isComponentFabricSlotAvailableForModel('secundaria_2', 1), false);
  assert.equal(secondaryFabricSlotIndex('secundaria_3'), 3);
  assert.equal(secondaryFabricSlotIndex('principal'), 0);
});

test('resuelve la tela principal propia de cada modelo, sin cruzar inventarios', () => {
  const assignments = [
    { productModelId: 'product-a', fabricSlot: 'principal', textileId: 'polialgodon' },
    { productModelId: 'product-b', fabricSlot: 'principal', textileId: 'win-sublimada' },
    { productModelId: 'product-a', fabricSlot: 'secundaria_1', textileId: 'tafetan' },
    { productModelId: 'product-b', fabricSlot: 'secundaria_1', textileId: 'taslan' },
  ];
  assert.equal(resolveComponentPieceTextileId('product-a', 'principal', assignments), 'polialgodon');
  assert.equal(resolveComponentPieceTextileId('product-b', 'principal', assignments), 'win-sublimada');
  assert.equal(resolveComponentPieceTextileId('product-a', 'secundaria_1', assignments), 'tafetan');
  assert.equal(resolveComponentPieceTextileId('product-b', 'secundaria_1', assignments), 'taslan');
  assert.equal(resolveComponentPieceTextileId('product-a', 'ninguna', assignments), null);
  assert.equal(resolveComponentPieceTextileId('product-a', 'secundaria_2', assignments), null);
  assert.equal(resolveComponentPieceTextileId('product-c', 'principal', assignments), null);
});

test('presenta etiquetas inequívocas para la posición seleccionada', () => {
  assert.equal(componentFabricSlotLabel('principal'), 'Tela principal 1');
  assert.equal(componentFabricSlotLabel('secundaria_2'), 'Tela secundaria 2');
  assert.equal(componentFabricSlotLabel('ninguna'), 'Sin tela vinculada');
});
