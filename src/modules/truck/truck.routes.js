const express = require('express');
const router = express.Router();
const truckService = require('./truck.service');
const asyncHandler = require('../../utils/asyncHandler');

/**
 * @route   GET /api/truck
 * @desc    Get all trucks
 * @access  Public
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const trucks = await truckService.getAllTrucks();
    res.status(200).json({
      status: 'success',
      data: { trucks },
    });
  })
);

/**
 * @route   GET /api/truck/available
 * @desc    Get available trucks
 * @access  Public
 */
router.get(
  '/available',
  asyncHandler(async (req, res) => {
    const trucks = await truckService.getAvailableTrucks();
    res.status(200).json({
      status: 'success',
      data: { trucks },
    });
  })
);

/**
 * @route   GET /api/truck/:id
 * @desc    Get single truck details by ID
 * @access  Public
 */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const truck = await truckService.getTruck(req.params.id);
    res.status(200).json({
      status: 'success',
      data: { truck },
    });
  })
);

/**
 * @route   GET /api/truck/:id/maintenance
 * @desc    Get maintenance logs for a truck
 * @access  Public
 */
router.get(
  '/:id/maintenance',
  asyncHandler(async (req, res) => {
    const logs = await truckService.getMaintenanceLogs(req.params.id);
    res.status(200).json({
      status: 'success',
      data: { logs },
    });
  })
);

/**
 * @route   PATCH /api/truck/:id/fuel
 * @desc    Update truck fuel level
 * @access  Public
 */
router.patch(
  '/:id/fuel',
  asyncHandler(async (req, res) => {
    const truck = await truckService.updateFuel(req.params.id, req.body.fuelLevel);
    res.status(200).json({
      status: 'success',
      message: 'Fuel level updated successfully.',
      data: { truck },
    });
  })
);

module.exports = router;
