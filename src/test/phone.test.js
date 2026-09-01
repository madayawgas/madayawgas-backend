const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parsePhoneNumber, isValidPhoneNumber, getPhoneType } = require('../utils/phoneParser');

test('Philippine Phone Number Parser & Normalizer Unit Tests', async (t) => {
  await t.test('1. Mobile Formats Normalization to +639XXXXXXXXX', () => {
    const mobileSamples = [
      // Standard international format with +
      '+639171234567',
      // Standard local with leading zero
      '09171234567',
      // Formatted with brackets and spaces
      '(+63) 917 123 4567',
      // Space separated
      '+63 917 123 4567',
      '0917 123 4567',
      // Hyphenated
      '0917-123-4567',
      '(+63) 917-123-4567',
      '+63-917-123-4567',
      // Domestic without +
      '639171234567',
    ];

    for (const sample of mobileSamples) {
      const result = parsePhoneNumber(sample);
      assert.equal(result, '+639171234567', `Failed for sample: ${sample}`);
      assert.equal(isValidPhoneNumber(sample), true);
      assert.equal(getPhoneType(sample), 'MOBILE');
    }
  });

  await t.test('2. Landline Formats (Metro Manila, Area Code 02)', () => {
    const landlineSamples = [
      '+63281234567',
      '(02) 8123-4567',
      '02-8123-4567',
      '(02) 8123 4567',
      '0281234567',
      '+63 2 8123 4567',
    ];

    for (const sample of landlineSamples) {
      const result = parsePhoneNumber(sample);
      assert.equal(result, '+63281234567', `Failed for sample: ${sample}`);
      assert.equal(isValidPhoneNumber(sample), true);
      assert.equal(getPhoneType(sample), 'LANDLINE');
    }
  });

  await t.test('3. Landline Formats (Provincial, 2-digit Area Codes e.g. 082 Davao, 032 Cebu)', () => {
    const davaoSamples = [
      '+63822245678',
      '(082) 224-5678',
      '0822245678',
      '082-224-5678',
      '+63 82 224 5678',
      '(+6382) 224-5678',
    ];

    for (const sample of davaoSamples) {
      const result = parsePhoneNumber(sample);
      assert.equal(result, '+63822245678', `Failed for sample: ${sample}`);
      assert.equal(isValidPhoneNumber(sample), true);
      assert.equal(getPhoneType(sample), 'LANDLINE');
    }
  });

  await t.test('4. Optional Phone Handling (required: false)', () => {
    assert.equal(parsePhoneNumber(null, { required: false }), null);
    assert.equal(parsePhoneNumber(undefined, { required: false }), null);
    assert.equal(parsePhoneNumber('', { required: false }), null);
    assert.equal(parsePhoneNumber('   ', { required: false }), null);
  });

  await t.test('5. Invalid Phone Numbers Rejection', () => {
    const invalidSamples = [
      '12345',               // Too short
      '091712345',           // Missing digit
      '091712345678',        // Extra digit
      'abc0917123456',       // Alphanumeric
      '+14155552671',        // US international number
      '+6309171234567',      // Double prefix
      '00000000000',         // Invalid prefix
    ];

    for (const sample of invalidSamples) {
      assert.throws(
        () => parsePhoneNumber(sample),
        /Invalid Philippine phone number format/,
        `Should throw for invalid sample: ${sample}`
      );
      assert.equal(isValidPhoneNumber(sample), false);
      assert.equal(getPhoneType(sample), null);
    }
  });

  await t.test('6. Required Missing Phone Number Rejection', () => {
    assert.throws(() => parsePhoneNumber(null, { required: true }), /Contact number is required/);
    assert.throws(() => parsePhoneNumber('', { required: true }), /Contact number is required/);
  });
});
