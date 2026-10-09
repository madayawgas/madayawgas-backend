const mediaService = require('./media.service');

/**
 * Handles media upload requests (multipart/form-data).
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
async function uploadMedia(req, res) {
  if (!req.file) {
    return res.status(400).json({
      status: 'fail',
      code: 'FILE_REQUIRED',
      message: 'No file uploaded or file field missing',
    });
  }

  const domain = req.body?.domain;
  if (!domain || typeof domain !== 'string' || domain.trim() === '') {
    return res.status(400).json({
      status: 'fail',
      code: 'DOMAIN_REQUIRED',
      message: 'Media domain is required (e.g. maintenance/receipts, fleet/vehicles)',
    });
  }

  const result = await mediaService.uploadMedia({
    file: req.file,
    domain: domain.trim(),
    req,
  });

  return res.status(201).json({
    status: 'success',
    data: result,
  });
}

/**
 * Resolves a canonical relative storage key into an accessible URL.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
async function resolveMedia(req, res) {
  const storageKey = req.body?.storageKey;

  if (!storageKey || typeof storageKey !== 'string' || storageKey.trim() === '') {
    return res.status(400).json({
      status: 'fail',
      code: 'STORAGE_KEY_REQUIRED',
      message: 'storageKey must be provided as a non-empty string',
    });
  }

  const result = mediaService.resolveMedia(storageKey.trim(), req);

  return res.status(200).json({
    status: 'success',
    data: result,
  });
}

module.exports = {
  uploadMedia,
  resolveMedia,
};
