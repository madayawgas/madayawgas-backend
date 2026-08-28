const productsService = require('./products.service');

/**
 * Products Controller
 * Handles HTTP requests, parameter extraction, and status response formatting for Inventory products.
 */
class ProductsController {
  /**
   * GET /api/inventory/products
   * List all products with optional filters.
   */
  async getAllProducts(req, res) {
    const { isActive, status, category, containerType, search } = req.query || {};
    const products = await productsService.getAllProducts({
      isActive,
      status,
      category,
      containerType,
      search,
    });

    return res.status(200).json({
      status: 'success',
      data: {
        count: products.length,
        products,
      },
    });
  }

  /**
   * GET /api/inventory/products/:id
   * Retrieve single product profile by UUID.
   */
  async getProductById(req, res) {
    try {
      const product = await productsService.getProductById(req.params.id);
      return res.status(200).json({
        status: 'success',
        data: { product },
      });
    } catch (err) {
      const isNotFound = err.message === 'Product not found';
      return res.status(isNotFound ? 404 : 400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * POST /api/inventory/products
   * Register a new product item.
   */
  async createProduct(req, res) {
    try {
      const product = await productsService.createProduct(req.user, req.body || {});
      return res.status(201).json({
        status: 'success',
        data: { product },
      });
    } catch (err) {
      return res.status(400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * PATCH /api/inventory/products/:id
   * Update product item information.
   */
  async updateProduct(req, res) {
    try {
      const product = await productsService.updateProduct(req.params.id, req.body || {});
      return res.status(200).json({
        status: 'success',
        data: { product },
      });
    } catch (err) {
      const isNotFound = err.message === 'Product not found';
      return res.status(isNotFound ? 404 : 400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }

  /**
   * PATCH /api/inventory/products/:id/deactivate
   * Deactivate a product item.
   */
  async deactivateProduct(req, res) {
    try {
      const product = await productsService.deactivateProduct(req.params.id);
      return res.status(200).json({
        status: 'success',
        message: 'Product successfully deactivated',
        data: { product },
      });
    } catch (err) {
      const isNotFound = err.message === 'Product not found';
      return res.status(isNotFound ? 404 : 400).json({
        status: 'fail',
        message: err.message,
      });
    }
  }
}

module.exports = new ProductsController();
