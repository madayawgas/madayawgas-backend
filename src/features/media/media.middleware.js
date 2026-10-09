const multer = require('multer');

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    const error = new Error(
      `Unsupported media type '${file.mimetype}'. Allowed types: image/jpeg, image/png, image/webp, application/pdf`
    );
    error.statusCode = 400;
    error.code = 'UNSUPPORTED_MEDIA_TYPE';
    return cb(error, false);
  }
  cb(null, true);
};

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
  },
  fileFilter,
});

/**
 * Middleware factory for single file uploads with standardized error envelopes.
 *
 * @param {string} [fieldName='file'] - Form-data field name
 * @returns {import('express').RequestHandler}
 */
function uploadSingleMedia(fieldName = 'file') {
  const single = upload.single(fieldName);

  return (req, res, next) => {
    single(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({
            status: 'fail',
            code: 'FILE_TOO_LARGE',
            message: 'File size exceeds maximum allowed limit of 5 MB',
          });
        }

        if (err.code === 'UNSUPPORTED_MEDIA_TYPE' || err.statusCode === 400) {
          return res.status(400).json({
            status: 'fail',
            code: err.code || 'UNSUPPORTED_MEDIA_TYPE',
            message: err.message,
          });
        }

        return res.status(400).json({
          status: 'fail',
          code: err.code || 'UPLOAD_ERROR',
          message: err.message || 'File upload error',
        });
      }

      next();
    });
  };
}

module.exports = {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  uploadSingleMedia,
};
