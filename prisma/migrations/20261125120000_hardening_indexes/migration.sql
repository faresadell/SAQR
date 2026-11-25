-- Hot lookups: a driver's deliveries (location posts, board, history) and orders by delivery stage.
CREATE INDEX "DeliveryRecord_driverId_idx" ON "DeliveryRecord"("driverId");
CREATE INDEX "Order_deliveryStatus_idx" ON "Order"("deliveryStatus");
