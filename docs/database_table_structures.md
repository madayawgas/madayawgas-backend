### User Management

Table Name: roles

| Column | Data Type | Constraints |
| :--- | :--- | :--- |
| `id` | `UUID` | `PK, NOT NULL, DEFAULT gen_random_uuid()` |
| `name` | `VARCHAR(50)` | `UK, NOT NULL` |
| `description` | `TEXT` | `NULL` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT NOW()` |

Table Name: permissions

| Column | Data Type | Constraints |
| :--- | :--- | :--- |
| `id` | `UUID` | `PK, NOT NULL, DEFAULT gen_random_uuid()` |
| `name` | `VARCHAR(100)` | `UK, NOT NULL` |
| `description` | `TEXT` | `NULL` |

Table Name: role_permissions

| Column | Data Type | Constraints |
| :--- | :--- | :--- |
| `role_id` | `UUID` | `PK, FK -> roles(id), NOT NULL` |
| `permission_id` | `UUID` | `PK, FK -> permissions(id), NOT NULL` |

Table Name: users

| Column | Data Type | Constraints |
| :--- | :--- | :--- |
| `id` | `UUID` | `PK, NOT NULL, DEFAULT gen_random_uuid()` |
| `username` | `VARCHAR(50)` | `UK, NOT NULL` |
| `password_hash` | `TEXT` | `NOT NULL` |
| `first_name` | `VARCHAR(100)` | `NOT NULL` |
| `last_name` | `VARCHAR(100)` | `NOT NULL` |
| `phone` | `VARCHAR(20)` | `NULL` |
| `birthdate` | `DATE` | `NULL` |
| `avatar_media_key` | `VARCHAR(255)` | `NULL` |
| `role_id` | `UUID` | `FK -> roles(id), NOT NULL` |
| `is_active` | `BOOLEAN` | `NOT NULL, DEFAULT TRUE` |
| `is_blocked` | `BOOLEAN` | `NOT NULL, DEFAULT FALSE` |
| `must_change_password` | `BOOLEAN` | `NOT NULL, DEFAULT TRUE` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT NOW()` |

Table Name: user_roles

| Column | Data Type | Constraints |
| :--- | :--- | :--- |
| `user_id` | `UUID` | `PK, FK -> users(id) ON DELETE CASCADE, NOT NULL` |
| `role_id` | `UUID` | `PK, FK -> roles(id) ON DELETE RESTRICT, NOT NULL` |
| `is_primary` | `BOOLEAN` | `NOT NULL, DEFAULT FALSE` |
| `assigned_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT NOW()` |

Table Name: sessions

| Column | Data Type | Constraints |
| :--- | :--- | :--- |
| `id` | `UUID` | `PK, NOT NULL, DEFAULT gen_random_uuid()` |
| `user_id` | `UUID` | `FK -> users(id), NOT NULL` |
| `token_hash` | `VARCHAR(255)` | `NOT NULL` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT NOW()` |
| `expires_at` | `TIMESTAMPTZ` | `NOT NULL` |
| `revoked_at` | `TIMESTAMPTZ` | `NULL` |

Table Name: audit_logs

| Column | Data Type | Constraints |
| :--- | :--- | :--- |
| `id` | `UUID` | `PK, NOT NULL, DEFAULT gen_random_uuid()` |
| `user_id` | `UUID` | `FK -> users(id), NOT NULL` |
| `target_user_id` | `UUID` | `FK -> users(id), NULL` |
| `action` | `VARCHAR(100)` | `NOT NULL` |
| `description` | `TEXT` | `NULL` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT NOW()` |

### System Logic (Cross-Cutting Infrastructure)

Table Name: history_logs

| Column | Data Type | Constraints |
| :--- | :--- | :--- |
| `id` | `UUID` | `PK, NOT NULL, DEFAULT gen_random_uuid()` |
| `user_id` | `UUID` | `FK -> users(id) ON DELETE SET NULL, NULL` |
| `user_name` | `VARCHAR(150)` | `NOT NULL` |
| `user_role` | `VARCHAR(100)` | `NOT NULL` |
| `action_type` | `VARCHAR(50)` | `NOT NULL` |
| `module` | `VARCHAR(100)` | `NOT NULL` |
| `action` | `VARCHAR(100)` | `NOT NULL` |
| `details` | `TEXT` | `NOT NULL` |
| `target_id` | `VARCHAR(255)` | `NULL` |
| `target_type` | `VARCHAR(100)` | `NULL` |
| `metadata` | `JSONB` | `NULL, DEFAULT '{}'::jsonb` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT NOW()` |

### Fleet & Maintenance

Table Name: vehicles

| Column | Data Type | Constraints |
| :--- | :--- | :--- |
| `id` | `UUID` | `PK, NOT NULL, DEFAULT gen_random_uuid()` |
| `driver_id` | `UUID` | `UK, FK -> users(id) ON DELETE SET NULL, NULL` |
| `vehicle_type` | `VARCHAR(30)` | `NOT NULL, DEFAULT 'DELIVERY_TRUCK', CHECK IN ('DELIVERY_TRUCK', 'SERVICE_PICKUP', 'MOTORCYCLE', 'UTILITY_VAN')` |
| `plate_number` | `VARCHAR(20)` | `UK, NOT NULL` |
| `model` | `VARCHAR(100)` | `NOT NULL` |
| `year_model` | `INT` | `NOT NULL` |
| `current_odometer` | `INT` | `NOT NULL, DEFAULT 0, CHECK (>= 0)` |
| `last_pm_odometer` | `INT` | `NOT NULL, DEFAULT 0, CHECK (>= 0)` |
| `pm_due_flag` | `BOOLEAN` | `NOT NULL, GENERATED ALWAYS AS ((current_odometer - last_pm_odometer) >= 5000) STORED` |
| `status` | `truck_status` | `NOT NULL, DEFAULT 'ACTIVE'` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT NOW()` |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT NOW()` |

Table Name: maintenance_types

| Column | Data Type | Constraints |
| :--- | :--- | :--- |
| `id` | `SERIAL` | `PK, NOT NULL` |
| `type_name` | `VARCHAR(50)` | `UK, NOT NULL` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT NOW()` |

Table Name: incident_types

| Column | Data Type | Constraints |
| :--- | :--- | :--- |
| `id` | `SERIAL` | `PK, NOT NULL` |
| `type_name` | `VARCHAR(50)` | `UK, NOT NULL` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT NOW()` |

Table Name: vehicle_odometer_logs

| Column | Data Type | Constraints |
| :--- | :--- | :--- |
| `id` | `UUID` | `PK, NOT NULL, DEFAULT gen_random_uuid()` |
| `vehicle_id` | `UUID` | `FK -> vehicles(id) ON DELETE CASCADE, NOT NULL` |
| `odometer_reading` | `INT` | `NOT NULL, CHECK (>= 0)` |
| `logged_by` | `UUID` | `FK -> users(id) ON DELETE SET NULL, NULL` |
| `source` | `VARCHAR(30)` | `NOT NULL, DEFAULT 'POST_DISPATCH_RETURN'` |
| `notes` | `TEXT` | `NULL` |
| `logged_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` |

Table Name: vehicle_inspections

| Column | Data Type | Constraints |
| :--- | :--- | :--- |
| `id` | `UUID` | `PK, NOT NULL, DEFAULT gen_random_uuid()` |
| `vehicle_id` | `UUID` | `FK -> vehicles(id) ON DELETE CASCADE, NOT NULL` |
| `inspector_id` | `UUID` | `FK -> users(id) ON DELETE SET NULL, NULL` |
| `result` | `VARCHAR(20)` | `NOT NULL, CHECK IN ('PASSED', 'NEEDS_ATTENTION', 'FAILED')` |
| `findings` | `TEXT` | `NOT NULL` |
| `issue_detected` | `BOOLEAN` | `NOT NULL, DEFAULT TRUE` |
| `allow_dispatch` | `BOOLEAN` | `NOT NULL, DEFAULT TRUE` |
| `inspection_date` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` |

Table Name: incident_reports

| Column | Data Type | Constraints |
| :--- | :--- | :--- |
| `id` | `UUID` | `PK, NOT NULL, DEFAULT gen_random_uuid()` |
| `vehicle_id` | `UUID` | `FK -> vehicles(id) ON DELETE CASCADE, NOT NULL` |
| `reporter_id` | `UUID` | `FK -> users(id) ON DELETE SET NULL, NULL` |
| `incident_type_id` | `INT` | `FK -> incident_types(id) ON DELETE RESTRICT, NOT NULL` |
| `severity` | `VARCHAR(20)` | `NOT NULL, CHECK IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')` |
| `incident_location` | `VARCHAR(255)` | `NULL` |
| `description` | `TEXT` | `NOT NULL` |
| `report_date` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` |

Table Name: work_orders

| Column | Data Type | Constraints |
| :--- | :--- | :--- |
| `id` | `UUID` | `PK, NOT NULL, DEFAULT gen_random_uuid()` |
| `vehicle_id` | `UUID` | `FK -> vehicles(id) ON DELETE CASCADE, NOT NULL` |
| `creator_id` | `UUID` | `FK -> users(id) ON DELETE SET NULL, NULL` |
| `maintenance_type_id` | `INT` | `FK -> maintenance_types(id) ON DELETE RESTRICT, NOT NULL` |
| `status` | `VARCHAR(20)` | `NOT NULL, DEFAULT 'PENDING', CHECK IN ('PENDING', 'APPROVED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')` |
| `inspection_id` | `UUID` | `FK -> vehicle_inspections(id) ON DELETE SET NULL, NULL` |
| `incident_report_id` | `UUID` | `FK -> incident_reports(id) ON DELETE SET NULL, NULL` |
| `request_date` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` |
| `scheduled_date` | `TIMESTAMPTZ` | `NULL` |
| `shop_name` | `VARCHAR(150)` | `NULL` |
| `estimated_cost` | `NUMERIC(12, 2)` | `NOT NULL, DEFAULT 0.00, CHECK (>= 0)` |
| `description` | `TEXT` | `NOT NULL` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` |

Table Name: approval_requests

| Column | Data Type | Constraints |
| :--- | :--- | :--- |
| `id` | `UUID` | `PK, NOT NULL, DEFAULT gen_random_uuid()` |
| `work_order_id` | `UUID` | `FK -> work_orders(id) ON DELETE CASCADE, Partial UK (WHERE is_approved IS NULL), NOT NULL` |
| `decider_id` | `UUID` | `FK -> users(id) ON DELETE SET NULL, NULL` |
| `requested_date` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` |
| `decided_date` | `TIMESTAMPTZ` | `NULL` |
| `amount_requested` | `NUMERIC(12, 2)` | `NOT NULL, CHECK (>= 0)` |
| `is_approved` | `BOOLEAN` | `NULL` |
| `remarks` | `TEXT` | `NULL` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` |

Table Name: maintenance_logs

| Column | Data Type | Constraints |
| :--- | :--- | :--- |
| `id` | `UUID` | `PK, NOT NULL, DEFAULT gen_random_uuid()` |
| `work_order_id` | `UUID` | `UK, FK -> work_orders(id) ON DELETE CASCADE, NOT NULL` |
| `maintenance_type_id` | `INT` | `FK -> maintenance_types(id) ON DELETE RESTRICT, NOT NULL` |
| `severity` | `VARCHAR(20)` | `NOT NULL, CHECK IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')` |
| `date_started` | `TIMESTAMPTZ` | `NOT NULL` |
| `date_resolved` | `TIMESTAMPTZ` | `NOT NULL` |
| `parts_cost` | `NUMERIC(12, 2)` | `NOT NULL, DEFAULT 0.00, CHECK (>= 0)` |
| `labor_cost` | `NUMERIC(12, 2)` | `NOT NULL, DEFAULT 0.00, CHECK (>= 0)` |
| `total_cost` | `NUMERIC(12, 2)` | `NOT NULL, GENERATED ALWAYS AS (parts_cost + labor_cost) STORED` |
| `downtime_days` | `INT` | `NOT NULL, DEFAULT 0, CHECK (>= 0)` |
| `odometer_at_service` | `INT` | `NOT NULL, CHECK (>= 0)` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` |

Table Name: work_order_receipts

| Column | Data Type | Constraints |
| :--- | :--- | :--- |
| `id` | `UUID` | `PK, NOT NULL, DEFAULT gen_random_uuid()` |
| `work_order_id` | `UUID` | `FK -> work_orders(id) ON DELETE CASCADE, NOT NULL` |
| `uploaded_by` | `UUID` | `FK -> users(id) ON DELETE SET NULL, NULL` |
| `file_url` | `TEXT` | `NOT NULL` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` |

Table Name: vehicle_fuel_logs

| Column | Data Type | Constraints |
| :--- | :--- | :--- |
| `id` | `UUID` | `PK, NOT NULL, DEFAULT gen_random_uuid()` |
| `vehicle_id` | `UUID` | `FK -> vehicles(id) ON DELETE RESTRICT, NOT NULL` |
| `driver_id` | `UUID` | `FK -> users(id) ON DELETE SET NULL, NULL` |
| `trip_id` | `UUID` | `FK -> trips(id) ON DELETE SET NULL, NULL` |
| `recorded_by` | `UUID` | `FK -> users(id) ON DELETE RESTRICT, NOT NULL` |
| `liters_pumped` | `NUMERIC(8, 2)` | `NOT NULL, CHECK (> 0)` |
| `total_cost` | `NUMERIC(10, 2)` | `NOT NULL, CHECK (>= 0)` |
| `price_per_liter` | `NUMERIC(8, 2)` | `NOT NULL, CHECK (>= 0)` |
| `fuel_station` | `VARCHAR(150)` | `NULL` |
| `fuel_type` | `VARCHAR(50)` | `NOT NULL, DEFAULT 'DIESEL', CHECK IN ('DIESEL', 'GASOLINE', 'AUTO_LPG', 'OTHER')` |
| `odometer_reading` | `INT` | `NULL, CHECK (odometer_reading IS NULL OR odometer_reading >= 0)` |
| `receipt_media_key` | `VARCHAR(255)` | `NULL` |
| `fueled_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` |
| `notes` | `TEXT` | `NULL` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` |

### Trip & Schedule

Table Name: service_zones

| Column | Data Type | Constraints |
| :--- | :--- | :--- |
| `id` | `UUID` | `PK, NOT NULL, DEFAULT gen_random_uuid()` |
| `code` | `VARCHAR(50)` | `UK, NOT NULL` |
| `name` | `VARCHAR(100)` | `UK, NOT NULL` |
| `description` | `TEXT` | `NULL` |
| `is_active` | `BOOLEAN` | `NOT NULL, DEFAULT TRUE` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` |

Table Name: schedule_templates

| Column | Data Type | Constraints |
| :--- | :--- | :--- |
| `id` | `UUID` | `PK, NOT NULL, DEFAULT gen_random_uuid()` |
| `truck_id` | `UUID` | `FK -> vehicles(id) ON DELETE CASCADE, Composite UK (truck_id, day_of_week), NOT NULL` |
| `zone_id` | `UUID` | `FK -> service_zones(id) ON DELETE RESTRICT, NOT NULL` |
| `day_of_week` | `INT` | `Composite UK (truck_id, day_of_week), NOT NULL, CHECK (BETWEEN 1 AND 7)` |
| `default_sales_user_id` | `UUID` | `FK -> users(id) ON DELETE SET NULL, Partial UK (default_sales_user_id, day_of_week WHERE is_active = TRUE), NULL` |
| `is_active` | `BOOLEAN` | `NOT NULL, DEFAULT TRUE` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` |

Table Name: truck_schedules

| Column | Data Type | Constraints |
| :--- | :--- | :--- |
| `id` | `UUID` | `PK, NOT NULL, DEFAULT gen_random_uuid()` |
| `scheduled_date` | `DATE` | `NOT NULL` |
| `truck_id` | `UUID` | `FK -> vehicles(id) ON DELETE RESTRICT, Partial UK (truck_id, scheduled_date WHERE status <> 'CANCELLED'), NOT NULL` |
| `sales_user_id` | `UUID` | `FK -> users(id) ON DELETE RESTRICT, Partial UK (sales_user_id, scheduled_date WHERE status <> 'CANCELLED'), NOT NULL` |
| `zone_id` | `UUID` | `FK -> service_zones(id) ON DELETE RESTRICT, NOT NULL` |
| `created_by` | `UUID` | `FK -> users(id) ON DELETE SET NULL, NULL` |
| `status` | `schedule_status` | `NOT NULL, DEFAULT 'SCHEDULED'` |
| `notes` | `TEXT` | `NULL` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` |

Table Name: trips

| Column | Data Type | Constraints |
| :--- | :--- | :--- |
| `id` | `UUID` | `PK, NOT NULL, DEFAULT gen_random_uuid()` |
| `schedule_id` | `UUID` | `FK -> truck_schedules(id) ON DELETE SET NULL, Partial UK (WHERE schedule_id IS NOT NULL), NULL` |
| `truck_id` | `UUID` | `FK -> vehicles(id) ON DELETE RESTRICT, Partial UK (WHERE status IN ('PENDING', 'IN_PROGRESS', 'RETURNED')), NOT NULL` |
| `driver_id` | `UUID` | `FK -> users(id) ON DELETE RESTRICT, Partial UK (WHERE status IN ('PENDING', 'IN_PROGRESS')), NOT NULL` |
| `sales_user_id` | `UUID` | `FK -> users(id) ON DELETE RESTRICT, Partial UK (WHERE status IN ('PENDING', 'IN_PROGRESS')), NOT NULL` |
| `zone_id` | `UUID` | `FK -> service_zones(id) ON DELETE RESTRICT, NOT NULL` |
| `dispatched_by` | `UUID` | `FK -> users(id) ON DELETE SET NULL, NULL` |
| `ended_by` | `UUID` | `FK -> users(id) ON DELETE SET NULL, NULL` |
| `return_odometer_log_id` | `UUID` | `UK, FK -> vehicle_odometer_logs(id) ON DELETE SET NULL, NULL` |
| `trip_number` | `VARCHAR(50)` | `UK, NOT NULL` |
| `status` | `trip_status` | `NOT NULL, DEFAULT 'IN_PROGRESS'` |
| `departure_time` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` |
| `return_time` | `TIMESTAMPTZ` | `NULL` |
| `notes` | `TEXT` | `NULL` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` |

Table Name: trip_loads

| Column | Data Type | Constraints |
| :--- | :--- | :--- |
| `id` | `UUID` | `PK, NOT NULL, DEFAULT gen_random_uuid()` |
| `trip_id` | `UUID` | `FK -> trips(id) ON DELETE CASCADE, NOT NULL` |
| `transfer_type` | `transfer_type` | `NOT NULL` |
| `slip_number` | `VARCHAR(50)` | `UK, NOT NULL` |
| `recorded_by` | `UUID` | `FK -> users(id) ON DELETE SET NULL, NULL` |
| `recorded_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` |
| `remarks` | `TEXT` | `NULL` |

Table Name: trip_load_items

| Column | Data Type | Constraints |
| :--- | :--- | :--- |
| `id` | `UUID` | `PK, NOT NULL, DEFAULT gen_random_uuid()` |
| `load_id` | `UUID` | `FK -> trip_loads(id) ON DELETE CASCADE, NOT NULL` |
| `product_id` | `UUID` | `FK -> products(id) ON DELETE RESTRICT, NOT NULL` |
| `condition` | `stock_condition` | `NOT NULL` |
| `quantity_units` | `INT` | `NOT NULL, CHECK (>= 0)` |

Table Name: trip_stock_reconciliations

| Column | Data Type | Constraints |
| :--- | :--- | :--- |
| `id` | `UUID` | `PK, NOT NULL, DEFAULT gen_random_uuid()` |
| `trip_id` | `UUID` | `UK, FK -> trips(id) ON DELETE CASCADE, NOT NULL` |
| `verified_by` | `UUID` | `FK -> users(id) ON DELETE SET NULL, NULL` |
| `total_loaded_full` | `INT` | `NOT NULL, DEFAULT 0, CHECK (>= 0)` |
| `total_sold_full` | `INT` | `NOT NULL, DEFAULT 0, CHECK (>= 0)` |
| `total_returned_full` | `INT` | `NOT NULL, DEFAULT 0, CHECK (>= 0)` |
| `total_returned_empty_good` | `INT` | `NOT NULL, DEFAULT 0, CHECK (>= 0)` |
| `total_returned_defective` | `INT` | `NOT NULL, DEFAULT 0, CHECK (>= 0)` |
| `net_customer_debt_created` | `INT` | `NOT NULL, DEFAULT 0` |
| `full_discrepancy` | `INT` | `NOT NULL, DEFAULT 0` |
| `empty_discrepancy` | `INT` | `NOT NULL, DEFAULT 0` |
| `reconciliation_data` | `JSONB` | `NOT NULL, DEFAULT '[]'::jsonb` |
| `status` | `reconciliation_status` | `NOT NULL, DEFAULT 'AWAITING_SYNC'` |
| `supervisor_notes` | `TEXT` | `NULL` |
| `reconciled_at` | `TIMESTAMPTZ` | `NULL` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` |

Table Name: driver_apprehensions

| Column | Data Type | Constraints |
| :--- | :--- | :--- |
| `id` | `UUID` | `PK, NOT NULL, DEFAULT gen_random_uuid()` |
| `vehicle_id` | `UUID` | `FK -> vehicles(id) ON DELETE RESTRICT, NOT NULL` |
| `driver_id` | `UUID` | `FK -> users(id) ON DELETE RESTRICT, NOT NULL` |
| `trip_id` | `UUID` | `FK -> trips(id) ON DELETE SET NULL, NULL` |
| `recorded_by` | `UUID` | `FK -> users(id) ON DELETE RESTRICT, NOT NULL` |
| `citation_ticket_no` | `VARCHAR(100)` | `NULL` |
| `violation_type` | `VARCHAR(100)` | `NOT NULL` |
| `apprehending_agency` | `VARCHAR(100)` | `NOT NULL` |
| `incident_time` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` |
| `location` | `VARCHAR(255)` | `NULL` |
| `penalty_amount` | `NUMERIC(10, 2)` | `NOT NULL, DEFAULT 0.00, CHECK (>= 0)` |
| `ticket_media_key` | `VARCHAR(255)` | `NOT NULL` |
| `notes` | `TEXT` | `NULL` |
| `status` | `VARCHAR(20)` | `NOT NULL, DEFAULT 'RECORDED', CHECK IN ('RECORDED', 'SETTLED', 'DISPUTED', 'CANCELLED')` |
| `settled_at` | `TIMESTAMPTZ` | `NULL` |
| `settled_by` | `UUID` | `FK -> users(id) ON DELETE SET NULL, NULL` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` |

Table Name: emergency_alerts

| Column | Data Type | Constraints |
| :--- | :--- | :--- |
| `id` | `UUID` | `PK, NOT NULL, DEFAULT gen_random_uuid()` |
| `driver_id` | `UUID` | `FK -> users(id) ON DELETE CASCADE, NOT NULL` |
| `vehicle_id` | `UUID` | `FK -> vehicles(id) ON DELETE SET NULL, NULL` |
| `trip_id` | `UUID` | `FK -> trips(id) ON DELETE SET NULL, NULL` |
| `latitude` | `NUMERIC(10, 7)` | `NULL, CHECK (latitude IS NULL OR (latitude >= -90.0 AND latitude <= 90.0))` |
| `longitude` | `NUMERIC(10, 7)` | `NULL, CHECK (longitude IS NULL OR (longitude >= -180.0 AND longitude <= 180.0))` |
| `emergency_type` | `VARCHAR(50)` | `NOT NULL, DEFAULT 'GENERAL', CHECK IN ('GENERAL', 'ACCIDENT', 'VEHICLE_BREAKDOWN', 'MEDICAL', 'SECURITY', 'OTHER')` |
| `description` | `TEXT` | `NULL` |
| `status` | `VARCHAR(20)` | `NOT NULL, DEFAULT 'ACTIVE', CHECK IN ('ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'FALSE_ALARM')` |
| `acknowledged_by` | `UUID` | `FK -> users(id) ON DELETE SET NULL, NULL` |
| `acknowledged_at` | `TIMESTAMPTZ` | `NULL` |
| `resolved_by` | `UUID` | `FK -> users(id) ON DELETE SET NULL, NULL` |
| `resolved_at` | `TIMESTAMPTZ` | `NULL` |
| `resolution_notes` | `TEXT` | `NULL` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` |

### Inventory

Table Name: products

| Column | Data Type | Constraints |
| :--- | :--- | :--- |
| `id` | `UUID` | `PK, NOT NULL, DEFAULT gen_random_uuid()` |
| `name` | `VARCHAR(255)` | `UK, NOT NULL` |
| `category` | `VARCHAR(100)` | `NOT NULL` |
| `container_type` | `container_type_enum` | `NOT NULL` |
| `net_weight_kg` | `NUMERIC(6, 3)` | `NOT NULL, CHECK (> 0)` |
| `is_active` | `BOOLEAN` | `NOT NULL, DEFAULT TRUE` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT NOW()` |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT NOW()` |

Table Name: plant_inventory

| Column | Data Type | Constraints |
| :--- | :--- | :--- |
| `id` | `UUID` | `PK, NOT NULL, DEFAULT gen_random_uuid()` |
| `product_id` | `UUID` | `UK, FK -> products(id) ON DELETE CASCADE, NOT NULL` |
| `quantity_filled` | `INT` | `NOT NULL, DEFAULT 0, CHECK (>= 0)` |
| `quantity_empty_good` | `INT` | `NOT NULL, DEFAULT 0, CHECK (>= 0)` |
| `quantity_defective` | `INT` | `NOT NULL, DEFAULT 0, CHECK (>= 0)` |
| `last_counted_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` |

Table Name: plant_stock_adjustments

| Column | Data Type | Constraints |
| :--- | :--- | :--- |
| `id` | `UUID` | `PK, NOT NULL, DEFAULT gen_random_uuid()` |
| `product_id` | `UUID` | `FK -> products(id) ON DELETE CASCADE, NOT NULL` |
| `recorded_by` | `UUID` | `FK -> users(id) ON DELETE SET NULL, NULL` |
| `adjustment_type` | `plant_adjustment_type` | `NOT NULL` |
| `target_condition` | `stock_condition` | `NOT NULL` |
| `delta_quantity` | `INT` | `NOT NULL` |
| `source_condition` | `stock_condition` | `NULL` |
| `supplier_invoice_number` | `VARCHAR(100)` | `NULL` |
| `reason` | `TEXT` | `NOT NULL` |
| `recorded_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT CURRENT_TIMESTAMP` |

### Sales & Delivery

Table Name: customers

| Column | Data Type | Constraints |
| :--- | :--- | :--- |
| `id` | `UUID` | `PK, NOT NULL, DEFAULT gen_random_uuid()` |
| `name` | `VARCHAR(255)` | `NOT NULL` |
| `business_name` | `VARCHAR(150)` | `NULL` |
| `contact_person` | `VARCHAR(100)` | `NOT NULL` |
| `contact_number` | `VARCHAR(50)` | `NOT NULL` |
| `alternate_contact_number` | `VARCHAR(30)` | `NULL` |
| `tin` | `VARCHAR(30)` | `NULL` |
| `address` | `TEXT` | `NOT NULL` |
| `delivery_address` | `TEXT` | `NOT NULL` |
| `customer_type` | `VARCHAR(30)` | `NOT NULL, CHECK IN ('COMMERCIAL', 'RETAIL', 'RETAILER', 'WHOLESALE', 'HOUSEHOLD')` |
| `zone_id` | `UUID` | `FK -> service_zones(id) ON DELETE SET NULL, NULL` |
| `is_active` | `BOOLEAN` | `NOT NULL, DEFAULT TRUE` |
| `created_by` | `UUID` | `FK -> users(id) ON DELETE SET NULL, NULL` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT NOW()` |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT NOW()` |

Table Name: sales_transactions

| Column | Data Type | Constraints |
| :--- | :--- | :--- |
| `id` | `UUID` | `PK, NOT NULL, DEFAULT gen_random_uuid()` |
| `transaction_no` | `VARCHAR(50)` | `UK, NOT NULL` |
| `trip_id` | `UUID` | `FK -> trips(id) ON DELETE RESTRICT, NOT NULL` |
| `customer_id` | `UUID` | `FK -> customers(id) ON DELETE RESTRICT, NOT NULL` |
| `recorded_by` | `UUID` | `FK -> users(id) ON DELETE RESTRICT, NOT NULL` |
| `status` | `VARCHAR(20)` | `NOT NULL, DEFAULT 'COMPLETED', CHECK IN ('COMPLETED', 'CANCELLED')` |
| `cancellation_reason` | `TEXT` | `NULL` |
| `cancelled_by` | `UUID` | `FK -> users(id) ON DELETE SET NULL, NULL` |
| `cancelled_at` | `TIMESTAMPTZ` | `NULL` |
| `transacted_at` | `TIMESTAMPTZ` | `NOT NULL` |
| `synced_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT NOW()` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT NOW()` |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT NOW()` |

Table Name: sales_transaction_items

| Column | Data Type | Constraints |
| :--- | :--- | :--- |
| `id` | `UUID` | `PK, NOT NULL, DEFAULT gen_random_uuid()` |
| `transaction_id` | `UUID` | `FK -> sales_transactions(id) ON DELETE CASCADE, NOT NULL` |
| `product_id` | `UUID` | `FK -> products(id) ON DELETE RESTRICT, NOT NULL` |
| `quantity_sold` | `INT` | `NOT NULL, CHECK (>= 0)` |
| `empties_returned` | `INT` | `NOT NULL, DEFAULT 0, CHECK (>= 0)` |
| `empties_defective` | `INT` | `NOT NULL, DEFAULT 0, CHECK (>= 0)` |
| `unit_price_at_sale` | `NUMERIC(10, 2)` | `NOT NULL, CHECK (>= 0)` |
| `subtotal_amount` | `NUMERIC(12, 2)` | `NOT NULL, CHECK (>= 0)` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT NOW()` |

Table Name: sales_invoices

| Column | Data Type | Constraints |
| :--- | :--- | :--- |
| `id` | `UUID` | `PK, NOT NULL, DEFAULT gen_random_uuid()` |
| `transaction_id` | `UUID` | `UK, FK -> sales_transactions(id) ON DELETE CASCADE, NOT NULL` |
| `invoice_number` | `VARCHAR(50)` | `UK, NOT NULL` |
| `declaration_number` | `VARCHAR(50)` | `NOT NULL` |
| `total_amount` | `NUMERIC(12, 2)` | `NOT NULL, CHECK (>= 0)` |
| `payment_method` | `VARCHAR(20)` | `NOT NULL, CHECK IN ('CASH', 'GCASH')` |
| `payment_status` | `VARCHAR(20)` | `NOT NULL, DEFAULT 'PAID_UNVERIFIED', CHECK IN ('PAID_UNVERIFIED', 'VERIFIED')` |
| `payment_reference_number` | `VARCHAR(100)` | `NULL` |
| `payment_proof_key` | `VARCHAR(255)` | `NULL` |
| `verified_by` | `UUID` | `FK -> users(id) ON DELETE SET NULL, NULL` |
| `verified_at` | `TIMESTAMPTZ` | `NULL` |
| `transacted_at` | `TIMESTAMPTZ` | `NOT NULL` |
| `synced_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT NOW()` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT NOW()` |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT NOW()` |

Table Name: canister_ledger

| Column | Data Type | Constraints |
| :--- | :--- | :--- |
| `id` | `UUID` | `PK, NOT NULL, DEFAULT gen_random_uuid()` |
| `customer_id` | `UUID` | `FK -> customers(id) ON DELETE RESTRICT, NOT NULL` |
| `product_id` | `UUID` | `FK -> products(id) ON DELETE RESTRICT, NOT NULL` |
| `trip_id` | `UUID` | `FK -> trips(id) ON DELETE RESTRICT, NOT NULL` |
| `transaction_id` | `UUID` | `FK -> sales_transactions(id) ON DELETE CASCADE, NOT NULL` |
| `quantity_loaned` | `INT` | `NOT NULL, DEFAULT 0, CHECK (>= 0)` |
| `quantity_returned` | `INT` | `NOT NULL, DEFAULT 0, CHECK (>= 0)` |
| `net_balance_change` | `INT` | `NOT NULL, CHECK (net_balance_change = quantity_loaned - quantity_returned)` |
| `transacted_at` | `TIMESTAMPTZ` | `NOT NULL` |
| `synced_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT NOW()` |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL, DEFAULT NOW()` |
