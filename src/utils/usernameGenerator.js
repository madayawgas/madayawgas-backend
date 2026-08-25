/**
 * Cleans and normalizes a name string (removes accents, spaces, and non-alphanumeric characters).
 */
function sanitizeName(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics / accents
    .replace(/[^a-zA-Z0-9]/g, '')    // keep only alphanumeric
    .toLowerCase();
}

/**
 * Generates a base username from firstName and lastName.
 * Format: first letter of firstName + lastName (e.g. John Doe -> jdoe)
 */
function generateBaseUsername(firstName, lastName) {
  const cleanFirst = sanitizeName(firstName);
  const cleanLast = sanitizeName(lastName);

  if (!cleanFirst || !cleanLast) {
    throw new Error('Valid first name and last name are required to generate username');
  }

  return `${cleanFirst[0]}${cleanLast}`;
}

/**
 * Resolves a unique username against an array/set of existing usernames in the database.
 * If base is 'jdoe' and 'jdoe' exists, tries 'jdoe1', 'jdoe2', etc.
 */
function resolveUniqueUsername(baseUsername, existingUsernames = []) {
  const existingSet = new Set(existingUsernames.map((u) => u.toLowerCase()));

  if (!existingSet.has(baseUsername.toLowerCase())) {
    return baseUsername.toLowerCase();
  }

  let counter = 1;
  while (existingSet.has(`${baseUsername.toLowerCase()}${counter}`)) {
    counter++;
  }

  return `${baseUsername.toLowerCase()}${counter}`;
}

module.exports = {
  sanitizeName,
  generateBaseUsername,
  resolveUniqueUsername,
};
