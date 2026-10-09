const mediaRoutes = require('./media.routes');
const mediaService = require('./media.service');
const mediaStorage = require('./media.storage');
const mediaController = require('./media.controller');
const { uploadSingleMedia, ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } = require('./media.middleware');
const { ALLOWED_DOMAINS } = require('./media.service');

module.exports = {
  mediaRoutes,
  mediaService,
  mediaStorage,
  mediaController,
  uploadSingleMedia,
  ALLOWED_DOMAINS,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
};
