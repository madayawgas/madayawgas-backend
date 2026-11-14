-- ============================================================
-- FUEL MONITORING & OPERATIONAL TELEMETRY SEED
-- Seed 009: Vehicle Fuel Logs (2025-2026 Monotonic Odometer + Distance),
-- Driver Road Apprehensions, and Driver Emergency Alerts.
-- Receipt & ticket media keys cycle deterministically through
-- seed/mock1.jpg .. seed/mock10.jpg.
-- ============================================================

DO $$
DECLARE
    v_sup_id UUID;
    v_admin_id UUID;

    v_abc1001 UUID;
    v_abc1002 UUID;
    v_abc1003 UUID;
    v_abc1004 UUID;

    v_drv1 UUID;
    v_drv2 UUID;
    v_drv3 UUID;

    v_proof_keys TEXT[] := ARRAY[
        'seed/mock1.jpg',
        'seed/mock2.jpg',
        'seed/mock3.jpg',
        'seed/mock4.jpg',
        'seed/mock5.jpg',
        'seed/mock6.jpg',
        'seed/mock7.jpg',
        'seed/mock8.jpg',
        'seed/mock9.jpg',
        'seed/mock10.jpg'
    ];

    v_stations TEXT[] := ARRAY[
        'Petron Bajada',
        'Shell Matina Crossing',
        'Caltex Toril',
        'Seaoil Buhangin',
        'Phoenix Panacan',
        'Petron Calinan'
    ];

    v_step INT;
    v_total_steps CONSTANT INT := 70;
    v_days_ago INT;
    v_fuel_time TIMESTAMPTZ;
    v_month_num INT;
    v_price NUMERIC(8, 2);
    v_liters NUMERIC(8, 2);
    v_total_cost NUMERIC(10, 2);
    v_odo INT;
    v_trip_id UUID;
    v_station VARCHAR(150);
    v_proof_key VARCHAR(255);
    v_log_idx INT := 0;
    v_tag VARCHAR(100);
BEGIN
    SELECT id INTO v_sup_id FROM users WHERE username = 'logistics_supervisor' LIMIT 1;
    SELECT id INTO v_admin_id FROM users WHERE username = 'admin_user' LIMIT 1;
    IF v_sup_id IS NULL THEN SELECT id INTO v_sup_id FROM users LIMIT 1; END IF;
    IF v_admin_id IS NULL THEN v_admin_id := v_sup_id; END IF;

    SELECT id, driver_id INTO v_abc1001, v_drv1 FROM vehicles WHERE plate_number = 'ABC-1001' LIMIT 1;
    SELECT id, driver_id INTO v_abc1002, v_drv2 FROM vehicles WHERE plate_number = 'ABC-1002' LIMIT 1;
    SELECT id, driver_id INTO v_abc1004, v_drv3 FROM vehicles WHERE plate_number = 'ABC-1004' LIMIT 1;
    SELECT id INTO v_abc1003 FROM vehicles WHERE plate_number = 'ABC-1003' LIMIT 1;

    IF v_drv1 IS NULL THEN SELECT id INTO v_drv1 FROM users WHERE username = 'driver_user' LIMIT 1; END IF;
    IF v_drv2 IS NULL THEN v_drv2 := v_drv1; END IF;
    IF v_drv3 IS NULL THEN v_drv3 := v_drv1; END IF;

    -- ============================================================
    -- 1. CHRONOLOGICAL VEHICLE FUEL LOGS (JAN 2025 - NOV 2026)
    -- ============================================================
    -- 70 cycles (~every 9-10 days) across active trucks -> ~260+ fill-up records

    FOR v_step IN 0..(v_total_steps - 1) LOOP
        v_days_ago := ((v_total_steps - v_step) * 9) + 1;
        v_fuel_time := (CURRENT_DATE - v_days_ago) + TIME '17:10:00';
        v_month_num := EXTRACT(MONTH FROM v_fuel_time)::INT;

        -- Seasonal Davao diesel pump price (PHP 56.80 - 64.40)
        v_price := 58.20 + ((v_month_num % 6) * 0.95) + ((v_step % 4) * 0.35);

        -- A. ABC-1001 (Isuzu Elf N-Series: 31,580 -> 45,100 km, ~7.1 km/L)
        IF v_abc1001 IS NOT NULL THEN
            v_log_idx := v_log_idx + 1;
            v_tag := 'FUEL-HIST-1001-' || LPAD(v_step::TEXT, 3, '0');
            IF NOT EXISTS (SELECT 1 FROM vehicle_fuel_logs WHERE notes LIKE v_tag || '%') THEN
                v_odo := 31580 + ROUND((v_step::NUMERIC / (v_total_steps - 1)) * (45100 - 31580))::INT;
                v_liters := 25.50 + ((v_step * 7) % 6) * 1.40;
                v_total_cost := ROUND(v_liters * v_price, 2);
                v_station := v_stations[1 + (v_log_idx % ARRAY_LENGTH(v_stations, 1))];
                v_proof_key := v_proof_keys[1 + (v_log_idx % ARRAY_LENGTH(v_proof_keys, 1))];

                SELECT t.id INTO v_trip_id
                FROM trips t
                WHERE t.truck_id = v_abc1001
                  AND t.departure_time::date <= v_fuel_time::date
                ORDER BY t.departure_time DESC
                LIMIT 1;

                INSERT INTO vehicle_fuel_logs (
                    vehicle_id, driver_id, trip_id, recorded_by,
                    liters_pumped, total_cost, price_per_liter,
                    fuel_station, fuel_type, odometer_reading,
                    receipt_media_key, fueled_at, notes
                ) VALUES (
                    v_abc1001, v_drv1, v_trip_id, COALESCE(v_drv1, v_sup_id),
                    v_liters, v_total_cost, v_price,
                    v_station, 'DIESEL', v_odo,
                    v_proof_key, v_fuel_time, v_tag || ' - Post-route diesel refill'
                );
            END IF;
        END IF;

        -- B. ABC-1002 (Fuso Canter FE71: 46,120 -> 62,420 km, ~6.6 km/L)
        IF v_abc1002 IS NOT NULL THEN
            v_log_idx := v_log_idx + 1;
            v_tag := 'FUEL-HIST-1002-' || LPAD(v_step::TEXT, 3, '0');
            IF NOT EXISTS (SELECT 1 FROM vehicle_fuel_logs WHERE notes LIKE v_tag || '%') THEN
                v_odo := 46120 + ROUND((v_step::NUMERIC / (v_total_steps - 1)) * (62420 - 46120))::INT;
                v_liters := 32.00 + ((v_step * 5) % 7) * 1.60;
                v_total_cost := ROUND(v_liters * v_price, 2);
                v_station := v_stations[1 + ((v_log_idx + 2) % ARRAY_LENGTH(v_stations, 1))];
                v_proof_key := v_proof_keys[1 + (v_log_idx % ARRAY_LENGTH(v_proof_keys, 1))];

                SELECT t.id INTO v_trip_id
                FROM trips t
                WHERE t.truck_id = v_abc1002
                  AND t.departure_time::date <= v_fuel_time::date
                ORDER BY t.departure_time DESC
                LIMIT 1;

                INSERT INTO vehicle_fuel_logs (
                    vehicle_id, driver_id, trip_id, recorded_by,
                    liters_pumped, total_cost, price_per_liter,
                    fuel_station, fuel_type, odometer_reading,
                    receipt_media_key, fueled_at, notes
                ) VALUES (
                    v_abc1002, v_drv2, v_trip_id, COALESCE(v_drv2, v_sup_id),
                    v_liters, v_total_cost, v_price,
                    v_station, 'DIESEL', v_odo,
                    v_proof_key, v_fuel_time + INTERVAL '25 minutes', v_tag || ' - Post-route diesel refill'
                );
            END IF;
        END IF;

        -- C. ABC-1004 (Toyota Hilux Single Cab: 95,150 -> 114,900 km, ~10.2 km/L)
        IF v_abc1004 IS NOT NULL THEN
            v_log_idx := v_log_idx + 1;
            v_tag := 'FUEL-HIST-1004-' || LPAD(v_step::TEXT, 3, '0');
            IF NOT EXISTS (SELECT 1 FROM vehicle_fuel_logs WHERE notes LIKE v_tag || '%') THEN
                v_odo := 95150 + ROUND((v_step::NUMERIC / (v_total_steps - 1)) * (114900 - 95150))::INT;
                v_liters := 25.00 + ((v_step * 3) % 6) * 1.35;
                v_total_cost := ROUND(v_liters * v_price, 2);
                v_station := v_stations[1 + ((v_log_idx + 4) % ARRAY_LENGTH(v_stations, 1))];
                v_proof_key := v_proof_keys[1 + (v_log_idx % ARRAY_LENGTH(v_proof_keys, 1))];

                SELECT t.id INTO v_trip_id
                FROM trips t
                WHERE t.truck_id = v_abc1004
                  AND t.departure_time::date <= v_fuel_time::date
                ORDER BY t.departure_time DESC
                LIMIT 1;

                INSERT INTO vehicle_fuel_logs (
                    vehicle_id, driver_id, trip_id, recorded_by,
                    liters_pumped, total_cost, price_per_liter,
                    fuel_station, fuel_type, odometer_reading,
                    receipt_media_key, fueled_at, notes
                ) VALUES (
                    v_abc1004, v_drv3, v_trip_id, COALESCE(v_drv3, v_sup_id),
                    v_liters, v_total_cost, v_price,
                    v_station, 'DIESEL', v_odo,
                    v_proof_key, v_fuel_time + INTERVAL '45 minutes', v_tag || ' - Field service & delivery refill'
                );
            END IF;
        END IF;

        -- D. ABC-1003 (Hino 300 Series: 21,050 -> 27,920 km, logged up until 6 days ago before maintenance)
        IF v_abc1003 IS NOT NULL AND v_days_ago >= 7 AND (v_step % 2 = 0) THEN
            v_log_idx := v_log_idx + 1;
            v_tag := 'FUEL-HIST-1003-' || LPAD(v_step::TEXT, 3, '0');
            IF NOT EXISTS (SELECT 1 FROM vehicle_fuel_logs WHERE notes LIKE v_tag || '%') THEN
                v_odo := 21050 + ROUND((v_step::NUMERIC / (v_total_steps - 1)) * (27920 - 21050))::INT;
                v_liters := 28.00 + ((v_step * 5) % 5) * 1.50;
                v_total_cost := ROUND(v_liters * v_price, 2);
                v_station := v_stations[1 + ((v_log_idx + 1) % ARRAY_LENGTH(v_stations, 1))];
                v_proof_key := v_proof_keys[1 + (v_log_idx % ARRAY_LENGTH(v_proof_keys, 1))];

                INSERT INTO vehicle_fuel_logs (
                    vehicle_id, driver_id, trip_id, recorded_by,
                    liters_pumped, total_cost, price_per_liter,
                    fuel_station, fuel_type, odometer_reading,
                    receipt_media_key, fueled_at, notes
                ) VALUES (
                    v_abc1003, v_drv1, NULL, v_sup_id,
                    v_liters, v_total_cost, v_price,
                    v_station, 'DIESEL', v_odo,
                    v_proof_key, v_fuel_time + INTERVAL '10 minutes', v_tag || ' - Pre-maintenance historical refill'
                );
            END IF;
        END IF;
    END LOOP;

    -- ============================================================
    -- 2. DRIVER ROAD APPREHENSIONS
    -- ============================================================
    IF v_abc1001 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM driver_apprehensions WHERE citation_ticket_no = 'CTTMO-2025-8841') THEN
        INSERT INTO driver_apprehensions (
            vehicle_id, driver_id, recorded_by, citation_ticket_no, violation_type,
            apprehending_agency, incident_time, location, penalty_amount,
            ticket_media_key, notes, status, settled_at, settled_by
        ) VALUES
        (
            v_abc1001, v_drv1, v_sup_id, 'CTTMO-2025-8841', 'Truck Ban / Loading Zone Violation',
            'CTTMO Davao', NOW() - INTERVAL '240 days', 'C.M. Recto Ave., Davao City', 1500.00,
            'seed/mock6.jpg', 'Unloading window exceeded by 10 minutes; citation settled via City Treasurer.', 'SETTLED',
            NOW() - INTERVAL '235 days', v_admin_id
        ),
        (
            v_abc1002, v_drv2, v_sup_id, 'LTO-XI-2026-1029', 'Defective Tail Light Indicator',
            'LTO Region XI', NOW() - INTERVAL '95 days', 'MacArthur Highway, Matina, Davao City', 2000.00,
            'seed/mock7.jpg', 'Right rear indicator bulb failed mid-route; bulb replaced and fine settled.', 'SETTLED',
            NOW() - INTERVAL '90 days', v_admin_id
        ),
        (
            v_abc1004, v_drv3, v_sup_id, 'CTTMO-2026-4412', 'No Entry / One-Way Signage',
            'CTTMO Davao', NOW() - INTERVAL '12 days', 'San Pedro St., Poblacion, Davao City', 1000.00,
            'seed/mock8.jpg', 'Awaiting supervisor verification and City Treasurer payment.', 'RECORDED',
            NULL, NULL
        ),
        (
            v_abc1001, v_drv1, v_sup_id, 'LTO-XI-2026-5503', 'Overloading / Cargo Restraint Check',
            'LTO Region XI', NOW() - INTERVAL '32 days', 'Panacan Diversion Road, Davao City', 3000.00,
            'seed/mock9.jpg', 'Disputed with dashcam & dispatch load slip showing compliant gross weight.', 'DISPUTED',
            NULL, NULL
        );
    END IF;

    -- ============================================================
    -- 3. DRIVER EMERGENCY ALERTS
    -- ============================================================
    IF v_abc1002 IS NOT NULL AND NOT EXISTS (SELECT 1 FROM emergency_alerts WHERE description LIKE 'Rear outer tire blowout along Buhangin%') THEN
        INSERT INTO emergency_alerts (
            driver_id, vehicle_id, latitude, longitude, emergency_type, description,
            status, acknowledged_by, acknowledged_at, resolved_by, resolved_at,
            resolution_notes, created_at
        ) VALUES
        (
            v_drv2, v_abc1002, 7.1142500, 125.6184200, 'VEHICLE_BREAKDOWN',
            'Rear outer tire blowout along Buhangin Diversion Road; truck safely pulled over on shoulder.',
            'RESOLVED', v_sup_id, NOW() - INTERVAL '145 days' + INTERVAL '4 minutes',
            v_sup_id, NOW() - INTERVAL '145 days' + INTERVAL '2 hours',
            'Mobile vulcanizing crew dispatched; spare mounted and truck cleared.', NOW() - INTERVAL '145 days'
        ),
        (
            v_drv1, v_abc1003, 7.0431800, 125.5421100, 'VEHICLE_BREAKDOWN',
            'Spongy brake pedal reported descending Davao-Cotabato Highway km 18.',
            'RESOLVED', v_sup_id, NOW() - INTERVAL '4 days' + INTERVAL '3 minutes',
            v_sup_id, NOW() - INTERVAL '4 days' + INTERVAL '3 hours',
            'Vehicle towed to Bunawan yard and placed UNDER_MAINTENANCE.', NOW() - INTERVAL '4 days'
        ),
        (
            v_drv3, v_abc1004, 7.1520100, 125.6410800, 'GENERAL',
            'Accidental SOS trigger while securing tailgate cylinder straps in Panacan.',
            'FALSE_ALARM', v_sup_id, NOW() - INTERVAL '20 days' + INTERVAL '2 minutes',
            v_sup_id, NOW() - INTERVAL '20 days' + INTERVAL '6 minutes',
            'Confirmed via phone call with driver Eduardo; no assistance needed.', NOW() - INTERVAL '20 days'
        ),
        (
            v_drv1, v_abc1001, 7.0189400, 125.4956300, 'SECURITY',
            'Roadside checkpoint delay and crowd congestion near Toril Public Market.',
            'ACKNOWLEDGED', v_sup_id, NOW() - INTERVAL '1 day' + INTERVAL '5 minutes',
            NULL, NULL,
            'Logistics supervisor monitoring route delay.', NOW() - INTERVAL '1 day'
        );
    END IF;
END $$;
