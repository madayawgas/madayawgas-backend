const deliveryRepository = require('./deliveries.repository');

class DeliveryService {
  async getAllDeliveries() {
    return await deliveryRepository.findAll();
  }

  async getDeliveryById(id) {
    const delivery = await deliveryRepository.findById(id);
    if (!delivery) {
      const error = new Error(`Delivery with ID ${id} not found.`);
      error.statusCode = 404;
      throw error;
    }
    return delivery;
  }

  async createDelivery(deliveryData) {
    return await deliveryRepository.create(deliveryData);
  }

  async updateDeliveryStatus(id, updateData) {
    await this.getDeliveryById(id);
    return await deliveryRepository.updateStatus(id, updateData);
  }
}

module.exports = new DeliveryService();
