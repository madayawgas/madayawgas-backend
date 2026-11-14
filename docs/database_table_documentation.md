### User Management

Table Name: roles
- Purpose: Stores the system security roles used for access control across the web portal and mobile application.
- Structure:
- Notes: Pre-populated with seven canonical roles (Super Admin, Admin, Plant Supervisor, Logistics Supervisor, Sales Supervisor, Sales Person, and Driver). The Super Admin role is protected and cannot be deleted.

Table Name: permissions
- Purpose: Stores the granular feature permissions that protect backend API routes and operational actions.
- Structure:
- Notes: Permissions are defined by system seed and migration scripts using a standardized module-action naming convention (e.g., `users.manage`, `fleet.view`).

Table Name: role_permissions
- Purpose: Maps permissions to roles in a many-to-many relationship.
- Structure:
- Notes: Uses a composite primary key of `role_id` and `permission_id` to prevent duplicate permission assignments on the same role.

Table Name: users
- Purpose: Stores employee account profiles, login credentials, and account status flags.
- Structure:
- Notes: Usernames are automatically generated from the employee's first initial and last name, and temporary passwords are encrypted using bcrypt with `must_change_password` enabled by default on account creation.

Table Name: user_roles
- Purpose: Links users to one or more organizational roles, allowing an employee to hold multiple roles simultaneously.
- Structure:
- Notes: Tracks a primary role indicator (`is_primary`) that stays synchronized with the `role_id` field on the `users` table for backward compatibility.

Table Name: sessions
- Purpose: Tracks active and historical login sessions for cookie and bearer token authentication.
- Structure:
- Notes: Stores only the SHA-256 hash of the session token (`mg_sid`). Sessions expire after 8 hours of inactivity or 30 days from creation, and are immediately revoked when credentials or roles change.

Table Name: audit_logs
- Purpose: Records sensitive user administration actions such as account creation, role changes, credential resets, and account deactivation.
- Structure:
- Notes: Captures both the acting administrator (`user_id`) and the affected employee account (`target_user_id`).

### System Logic (Cross-Cutting Infrastructure)

Table Name: history_logs
- Purpose: Maintains a chronological audit log of operational and administrative events across all system modules.
- Structure:
- Notes: Stores denormalized snapshots of the user's full name and active role at the time of the action so historical logs remain accurate even if the user's profile changes later.

### Fleet & Maintenance

Table Name: vehicles
- Purpose: Stores master records for all company fleet vehicles, including delivery trucks, pickups, vans, and motorcycles.
- Structure:
- Notes: Supports a one-to-one driver assignment (`driver_id`) and automatically calculates the `pm_due_flag` column whenever the running odometer reaches 5,000 kilometers since the last preventive maintenance.

Table Name: maintenance_types
- Purpose: Stores standard categories for vehicle maintenance services.
- Structure:
- Notes: Lookup table containing fixed service classifications (`PREVENTIVE`, `CORRECTIVE`, `ACCIDENT_REPAIR`, and `EMERGENCY`).

Table Name: incident_types
- Purpose: Stores standard classifications for vehicle incidents and road defects.
- Structure:
- Notes: Lookup table categorizing operational issues such as mechanical defects, road accidents, tire failures, and leak issues.

Table Name: vehicle_odometer_logs
- Purpose: Records historical mileage readings captured during trip returns, inspections, or manual updates.
- Structure:
- Notes: Updating a vehicle's odometer through this log advances the `current_odometer` reading on the parent `vehicles` record.

Table Name: vehicle_inspections
- Purpose: Records defect and symptom inspection reports filed when an issue is observed on a vehicle.
- Structure:
- Notes: Routine pass-only checklists are not stored. Includes an `allow_dispatch` flag so supervisors can decide whether a vehicle with minor findings remains cleared for dispatch.

Table Name: incident_reports
- Purpose: Documents vehicle accidents, breakdowns, or mechanical incidents reported by drivers or supervisors.
- Structure:
- Notes: Can be linked to a work order when the reported incident requires repair or maintenance service.

Table Name: work_orders
- Purpose: Tracks vehicle repair and maintenance jobs from initial request and cost estimation through completion.
- Structure:
- Notes: Can be initiated directly, from a vehicle inspection, or from an incident report, and transitions through defined lifecycle statuses (`PENDING`, `APPROVED`, `SCHEDULED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`).

Table Name: approval_requests
- Purpose: Tracks budget approval requests and management decisions for maintenance work orders.
- Structure:
- Notes: Supports multiple sequential approval rounds if a request is rejected and resubmitted, while enforcing at most one pending request per work order at any time.

Table Name: maintenance_logs
- Purpose: Stores the final service record, actual costs, and vehicle downtime once a work order is marked as completed.
- Structure:
- Notes: Has a one-to-one relationship with a completed work order and automatically computes `total_cost` from `parts_cost` and `labor_cost`.

Table Name: work_order_receipts
- Purpose: Stores file links for uploaded repair receipts and invoices attached to a work order.
- Structure:
- Notes: Serves strictly as supporting visual documentation and is decoupled from the cost calculations in `maintenance_logs`.

Table Name: vehicle_fuel_logs
- Purpose: Records vehicle refueling transactions, fuel volume, cost per liter, and receipt images.
- Structure:
- Notes: Can be linked to an active trip and optionally records an odometer reading that updates the vehicle's mileage if higher than the current value.

### Trip & Schedule

Table Name: service_zones
- Purpose: Defines geographical delivery zones and route jurisdictions serviced by the company.
- Structure:
- Notes: Referenced by customer profiles, schedule templates, daily truck schedules, and trips to organize deliveries by area.

Table Name: schedule_templates
- Purpose: Stores recurring weekly dispatch templates that assign a truck, service zone, and default sales person to a specific day of the week.
- Structure:
- Notes: Enforces a unique constraint per truck and day of the week (`1` for Monday through `7` for Sunday) to prevent conflicting recurring assignments.

Table Name: truck_schedules
- Purpose: Stores date-specific daily route schedules generated from weekly templates or created manually by a supervisor.
- Structure:
- Notes: Partial unique indexes prevent assigning the same truck or sales person to multiple active schedules on the same calendar date.

Table Name: trips
- Purpose: Tracks the execution of delivery runs from plant departure to yard return and final stock completion.
- Structure:
- Notes: Captures a fixed snapshot of the assigned driver and sales person at dispatch time. Supports both scheduled runs and unscheduled ad-hoc trips (`schedule_id` is nullable), and locks the truck from new dispatches until the trip is reconciled.

Table Name: trip_loads
- Purpose: Records transfer manifests for stock loaded onto a truck before dispatch or unloaded upon return to the plant.
- Structure:
- Notes: Multiple load slips can be created for a single trip to support morning loads, midday reloads, and post-trip return unloads. Also exposed through the `trip_stock_transfers` compatibility view.

Table Name: trip_load_items
- Purpose: Stores the individual product quantities and stock conditions for each transfer manifest in `trip_loads`.
- Structure:
- Notes: Quantities are stored as integer unit counts categorized by condition (`FILLED`, `EMPTY_GOOD`, or `DEFECTIVE`). Also exposed through the `trip_stock_transfer_items` compatibility view.

Table Name: trip_stock_reconciliations
- Purpose: Records the post-trip inventory reconciliation comparing loaded stock, field sales, customer cylinder loans, and physically returned units.
- Structure:
- Notes: Calculates full and empty unit discrepancies and stores a per-product breakdown in a JSONB column (`reconciliation_data`).

Table Name: driver_apprehensions
- Purpose: Records roadside traffic citations and regulatory violations involving company vehicles and drivers.
- Structure:
- Notes: Requires a photo key of the physical citation ticket (`ticket_media_key`) and tracks the resolution status (`RECORDED`, `SETTLED`, `DISPUTED`, `CANCELLED`).

Table Name: emergency_alerts
- Purpose: Stores emergency SOS alerts triggered by drivers from the mobile app during field operations.
- Structure:
- Notes: Captures optional GPS coordinates (`latitude` and `longitude`) and tracks supervisor response through acknowledgment and resolution timestamps.

### Inventory

Table Name: products
- Purpose: Stores the master catalog of LPG cylinders, canisters, and related products offered by the company.
- Structure:
- Notes: Classifies items by container type (`CYLINDER` or `CANISTER`) and net weight in kilograms, using soft deactivation (`is_active`) to preserve historical references.

Table Name: plant_inventory
- Purpose: Tracks real-time physical unit counts of each product at the refilling plant across filled, empty good, and defective conditions.
- Structure:
- Notes: Enforces a one-to-one relationship with `products` and prevents negative stock balances on all condition buckets.

Table Name: plant_stock_adjustments
- Purpose: Logs all manual and operational stock adjustments made to the plant inventory, such as supplier purchases, defect quarantines, and physical count corrections.
- Structure:
- Notes: Serves as an append-only audit ledger recording the quantity delta, source and target stock conditions, and the supervisor who authorized the adjustment.

### Sales & Delivery

Table Name: customers
- Purpose: Stores customer master profiles, contact details, and delivery addresses for retail, commercial, wholesale, and household accounts.
- Structure:
- Notes: Uses database triggers to keep legacy `name` and `address` fields synchronized with `business_name`, `contact_person`, and `delivery_address`.

Table Name: sales_transactions
- Purpose: Records customer sales orders processed by sales personnel during delivery trips.
- Structure:
- Notes: Supports offline-first mobile synchronization by storing both the mobile transaction time (`transacted_at`) and the server ingestion time (`synced_at`).

Table Name: sales_transaction_items
- Purpose: Stores the individual product line items, quantities sold, and empty containers returned for each sales transaction.
- Structure:
- Notes: Captures a frozen snapshot of the unit price (`unit_price_at_sale`) and subtotal at the time of sale so future catalog price changes do not alter historical orders.

Table Name: sales_invoices
- Purpose: Stores billing invoices, cylinder declaration numbers, and payment verification details for sales transactions.
- Structure:
- Notes: Has a one-to-one relationship with `sales_transactions` and tracks cash or GCash payments, including reference numbers and payment proof images awaiting supervisor verification.

Table Name: canister_ledger
- Purpose: Tracks loaned and returned cylinders or canisters per customer and product when a sale involves an unequal container exchange.
- Structure:
- Notes: Operates as an append-only ledger where `net_balance_change` equals `quantity_loaned` minus `quantity_returned`, feeding into customer receivable balances and trip stock reconciliation.
