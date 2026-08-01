const truckRepository = require('./truck.repository');

class TruckService {
  async getAllTrucks() {
    return await truckRepository.findAll();
  }

  async getTruck(id) {
    const truck = await truckRepository.findById(Number(id));
    if (!truck) {
      const error = new Error('Truck not found.');
      error.statusCode = 404;
      throw error;
    }
    return truck;
  }

  async getAvailableTrucks() {
    return await truckRepository.findAvailable();
  }

  async getMaintenanceLogs(id) {
    await this.getTruck(id);
    return await truckRepository.findMaintenanceLogs(Number(id));
  }

  async updateFuel(id, fuelLevel) {
    if (fuelLevel === undefined || fuelLevel < 0 || fuelLevel > 100) {
      const error = new Error('Fuel level must be a number between 0 and 100.');
      error.statusCode = 400;
      throw error;
    }
    await this.getTruck(id);
    return await truckRepository.updateFuelLevel(Number(id), fuelLevel);
  }
}

module.exports = new TruckService();
