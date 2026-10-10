const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/auth.middleware');
const asyncHandler = require('../../utils/asyncHandler');
const { uploadSingleMedia } = require('./media.middleware');
const mediaController = require('./media.controller');

/**
 * @route   POST /api/media/upload
 * @desc    Upload media file into storage and receive canonical storage key
 * @access  Private (Authenticated session required)
 */
router.post(
  '/upload',
  authenticate,
  uploadSingleMedia('file'),
  asyncHandler(mediaController.uploadMedia)
);

/**
 * @route   POST /api/media/resolve
 * @desc    Resolve canonical relative storage key into fully qualified URL
 * @access  Private (Authenticated session required)
 */
router.post(
  '/resolve',
  authenticate,
  asyncHandler(mediaController.resolveMedia)
);

/**
 * @route   DELETE /api/media
 * @desc    Delete media file from storage by relative storage key or URL
 * @access  Private (Authenticated session required)
 */
router.delete(
  '/',
  authenticate,
  asyncHandler(mediaController.deleteMedia)
);

module.exports = router;

