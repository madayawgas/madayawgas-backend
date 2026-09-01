/**
 * Philippine Phone Number Parser & Normalizer
 * Standardizes mobile and landline phone numbers into canonical E.164 (+63...) format.
 */

/**
 * Normalizes and validates Philippine phone numbers (mobile & landline)
 * to standard E.164 international format (+63...).
 *
 * Supported formats:
 * - Mobile Formats:
 *   • +639171234567
 *   • 09171234567
 *   • (+63) 917 123 4567 or +63 917 123 4567
 *   • 0917-123-4567 or 0917 123 4567
 *   -> Normalized: +639171234567
 *
 * - Landline Formats (Metro Manila, Area Code 2):
 *   • +63281234567
 *   • (02) 8123-4567 or 02-8123-4567 or (02) 8123 4567 or 0281234567
 *   -> Normalized: +63281234567
 *
 * - Landline Formats (Provincial, 2-digit Area Codes e.g. 82 Davao, 32 Cebu, etc.):
 *   • +63822245678
 *   • (082) 224-5678 or 0822245678 or 082-224-5678 or +63 82 224 5678
 *   -> Normalized: +63822245678
 *
 * @param {string|null|undefined} input - Raw phone number string
 * @param {Object} [options]
 * @param {boolean} [options.required=true] - If true, throws when empty/null; if false, returns null
 * @returns {string|null} Canonical E.164 phone number (+63XXXXXXXXXX)
 */
function parsePhoneNumber(input, { required = true } = {}) {
  if (input === null || input === undefined || (typeof input === 'string' && input.trim().length === 0)) {
    if (required) {
      throw new Error('Contact number is required');
    }
    return null;
  }

  if (typeof input !== 'string') {
    throw new Error('Contact number must be a string');
  }

  const raw = input.trim();

  // Strip common separating punctuation: spaces, parentheses, hyphens, dots
  let cleaned = raw.replace(/[\s\(\)\-\.]/g, '');

  // Extract national subscriber digits
  let nationalNumber = cleaned;

  if (cleaned.startsWith('+63')) {
    nationalNumber = cleaned.slice(3);
  } else if (cleaned.startsWith('63') && cleaned.length >= 10) {
    nationalNumber = cleaned.slice(2);
  } else if (cleaned.startsWith('0')) {
    nationalNumber = cleaned.slice(1);
  }

  // Must contain only numeric digits
  if (!/^\d+$/.test(nationalNumber)) {
    throw new Error('Invalid Philippine phone number format');
  }

  // 1. Mobile Check: Starts with '9' and exactly 10 digits (e.g. 9171234567)
  if (/^9\d{9}$/.test(nationalNumber)) {
    return `+63${nationalNumber}`;
  }

  // 2. Landline Check (Metro Manila area code '2'):
  // 8-digit local subscriber number (standard) or 7-digit legacy
  if (/^2\d{7,8}$/.test(nationalNumber)) {
    return `+63${nationalNumber}`;
  }

  // 3. Landline Check (Provincial 2-digit area codes: 32-38, 42-49, 52-56, 72-78, 82-88):
  // 2-digit area code + 5 to 7 digits local subscriber number (typically 7 digits)
  // Total digits: 7 to 9 digits
  if (/^[3-8]\d{1}\d{5,7}$/.test(nationalNumber)) {
    return `+63${nationalNumber}`;
  }

  throw new Error('Invalid Philippine phone number format');
}

/**
 * Checks if an input string is a valid Philippine phone number.
 * @param {string} input
 * @returns {boolean}
 */
function isValidPhoneNumber(input) {
  try {
    parsePhoneNumber(input, { required: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns the classification of the phone number ('MOBILE', 'LANDLINE', or null).
 * @param {string} input
 * @returns {'MOBILE'|'LANDLINE'|null}
 */
function getPhoneType(input) {
  try {
    const canonical = parsePhoneNumber(input, { required: true });
    if (!canonical) return null;
    const digits = canonical.slice(3);
    if (digits.startsWith('9')) return 'MOBILE';
    return 'LANDLINE';
  } catch {
    return null;
  }
}

module.exports = {
  parsePhoneNumber,
  isValidPhoneNumber,
  getPhoneType,
};
