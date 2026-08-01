import * as repository from "./truck.repository.js";

export function getAllTrucks() {
  return repository.findAll();
}

export function getTruck(id) {
  const truck = repository.findById(Number(id));

  if (!truck) throw new Error("Truck not found.");

  return truck;
}

export function getAvailableTrucks() {
  return repository.findAvailable();
}

export function getMaintenanceLogs(id) {
  const logs = repository.findMaintenanceLogs(Number(id));

  if (!logs) throw new Error("Truck not found.");

  return logs;
}

export function updateFuel(id, fuelLevel) {
  if (fuelLevel < 0 || fuelLevel > 100)
    throw new Error("Fuel level must be between 0 and 100.");

  return repository.updateFuelLevel(Number(id), fuelLevel);
}
