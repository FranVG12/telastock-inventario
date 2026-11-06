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
const compiledModule = { exports: {} };
vm.runInNewContext(compiled, { exports: compiledModule.exports, module: compiledModule });
const {
  componentFabricSlotLabel,
  isComponentFabricSlot,
  isComponentFabricSlotAvailableForModel,
  normalizeComponentFabricSlot,
  resolveComponentPieceTextileId,
  secondaryFabricSlotIndex,
} = compiledModule.exports;

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

const sizeSpecSource = readFileSync(new URL('../lib/material-size-specifications.ts', import.meta.url), 'utf8');
const sizeSpecCompiled = ts.transpileModule(sizeSpecSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const sizeSpecModule = { exports: {} };
vm.runInNewContext(sizeSpecCompiled, { exports: sizeSpecModule.exports, module: sizeSpecModule });
const { mapSizeSpecificationRules, validateSizeSpecification, describeSizeSpecification } = sizeSpecModule.exports;

test('configura cierres por grupos de tallas sin convertirlos en inventario por variante', () => {
  const sizes = ['4','6','8','10','12','14','16','S','M','L','XL'];
  const rules = [
    { value: '13 cm', sizeIds: ['4','6','8'] },
    { value: '15 cm', sizeIds: ['10','12','14'] },
    { value: '18 cm', sizeIds: ['16','S','M','L','XL'] },
  ];
  const mapped = mapSizeSpecificationRules(rules, sizes);
  mapped.label = 'Longitud';
  assert.equal(mapped.bySize['4'], '13 cm');
  assert.equal(mapped.bySize['8'], '13 cm');
  assert.equal(mapped.bySize['10'], '15 cm');
  assert.equal(mapped.bySize['14'], '15 cm');
  assert.equal(mapped.bySize['16'], '18 cm');
  assert.equal(mapped.bySize.XL, '18 cm');
  assert.equal(describeSizeSpecification(mapped, 'M'), 'Longitud: 18 cm');
  assert.equal(validateSizeSpecification(mapped, sizes), true);
});

test('configura cinta elástica rígida por grupos sin mostrar tallas no incluidas', () => {
  const sizes = ['4','6','8','10','12','14','16','S','M','L','XL'];
  const mapped = mapSizeSpecificationRules([
    { value: '2.5 cm', sizeIds: ['4','6','8'] },
    { value: '3 cm', sizeIds: ['10','12','14'] },
    { value: '3.5 cm', sizeIds: ['16','S','M'] },
    { value: '4 cm', sizeIds: ['L','XL'] },
  ], sizes);
  assert.equal(mapped.bySize['4'], '2.5 cm');
  assert.equal(mapped.bySize['14'], '3 cm');
  assert.equal(mapped.bySize.S, '3.5 cm');
  assert.equal(mapped.bySize.XL, '4 cm');
});

test('rechaza tallas duplicadas, faltantes y valores vacíos en reglas', () => {
  assert.throws(() => mapSizeSpecificationRules([
    { value: '13 cm', sizeIds: ['4','6'] },
    { value: '15 cm', sizeIds: ['6','8'] },
  ], ['4','6','8']), /dos grupos/);
  assert.throws(() => mapSizeSpecificationRules([
    { value: '13 cm', sizeIds: ['4','6'] },
  ], ['4','6','8']), /Falta definir/);
  assert.throws(() => mapSizeSpecificationRules([
    { value: '', sizeIds: ['4'] },
  ], ['4']), /medida/);
});
