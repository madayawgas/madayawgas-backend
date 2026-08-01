const express = require('express');
const router = express.Router();
const deliveryService = require('./deliveries.service');
const asyncHandler = require('../../utils/asyncHandler');
const { authenticate } = require('../../middleware/auth.middleware');

/**
 * @route   GET /api/deliveries
 * @desc    Get all deliveries
 * @access  Protected
 */
router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const deliveries = await deliveryService.getAllDeliveries();
    res.status(200).json({
      status: 'success',
      data: { deliveries },
    });
  })
);

/**
 * @route   GET /api/deliveries/:id
 * @desc    Get delivery details by ID
 * @access  Protected
 */
router.get(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const delivery = await deliveryService.getDeliveryById(req.params.id);
    res.status(200).json({
      status: 'success',
      data: { delivery },
    });
  })
);

/**
 * @route   POST /api/deliveries
 * @desc    Create a new delivery schedule
 * @access  Protected
 */
router.post(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const newDelivery = await deliveryService.createDelivery(req.body);
    res.status(201).json({
      status: 'success',
      message: 'Delivery created successfully.',
      data: { delivery: newDelivery },
    });
  })
);

/**
 * @route   PATCH /api/deliveries/:id/status
 * @desc    Update delivery status / assigned driver
 * @access  Protected
 */
router.patch(
  '/:id/status',
  authenticate,
  asyncHandler(async (req, res) => {
    const updatedDelivery = await deliveryService.updateDeliveryStatus(req.params.id, req.body);
    res.status(200).json({
      status: 'success',
      message: 'Delivery status updated successfully.',
      data: { delivery: updatedDelivery },
    });
  })
);

module.exports = router;
