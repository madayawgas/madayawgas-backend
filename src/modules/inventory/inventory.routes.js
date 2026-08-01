const express = require('express');
const router = express.Router();
const inventoryService = require('./inventory.service');
const asyncHandler = require('../../utils/asyncHandler');
const { authenticate } = require('../../middleware/auth.middleware');

/**
 * @route   GET /api/inventory
 * @desc    Get paginated inventory items
 * @access  Public
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await inventoryService.getAllItems(req.query);
    res.status(200).json({
      status: 'success',
      data: result,
    });
  })
);

/**
 * @route   GET /api/inventory/:id
 * @desc    Get a single inventory item by ID
 * @access  Public
 */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const item = await inventoryService.getItemById(req.params.id);
    res.status(200).json({
      status: 'success',
      data: { item },
    });
  })
);

/**
 * @route   POST /api/inventory
 * @desc    Create a new inventory item
 * @access  Protected
 */
router.post(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const newItem = await inventoryService.createItem(req.body);
    res.status(201).json({
      status: 'success',
      message: 'Inventory item created successfully.',
      data: { item: newItem },
    });
  })
);

/**
 * @route   PUT /api/inventory/:id
 * @desc    Update an inventory item by ID
 * @access  Protected
 */
router.put(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    const updatedItem = await inventoryService.updateItem(req.params.id, req.body);
    res.status(200).json({
      status: 'success',
      message: 'Inventory item updated successfully.',
      data: { item: updatedItem },
    });
  })
);

/**
 * @route   DELETE /api/inventory/:id
 * @desc    Delete an inventory item by ID
 * @access  Protected
 */
router.delete(
  '/:id',
  authenticate,
  asyncHandler(async (req, res) => {
    await inventoryService.deleteItem(req.params.id);
    res.status(200).json({
      status: 'success',
      message: `Inventory item with ID ${req.params.id} has been deleted.`,
    });
  })
);

module.exports = router;
