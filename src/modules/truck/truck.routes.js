const express = require("express");
const router = express.Router();

const service = require("./truck.service");

router.get("/", (req, res) => {
  res.json(service.getAllTrucks());
});

router.get("/available", (req, res) => {
  res.json(service.getAvailableTrucks());
});

router.get("/:id", (req, res) => {
  res.json(service.getTruck(req.params.id));
});

router.get("/:id/maintenance", (req, res) => {
  res.json(service.getMaintenanceLogs(req.params.id));
});

router.patch("/:id/fuel", (req, res) => {
  const truck = service.updateFuel(req.params.id, req.body.fuelLevel);

  res.json(truck);
});

module.exports = router;
