# Fleet & Maintenance Subsystem ERD

> **Domain**: Fleet & Maintenance  
> **Key Rule (No Checklist)**: Inspections are strictly issue-reporting records logged when defects or symptoms are observed. No routine checklists.  
> **PM Threshold**: `(current_odometer - last_pm_odometer) >= 5000 km` triggers scheduled preventive maintenance via automated stored generated flag (`pm_due_flag`).  
> **Decoupled Receipts**: Work order receipts serve strictly as supporting audit evidence (0..N per work order), completely decoupled from manual labor and parts financial math.

```mermaid
---
config:
  layout: elk
  theme: neutral
---

erDiagram

    %% ==========================================
    %% DOMAIN CLASSIFICATIONS & TYPES
    %% ==========================================

    %% vehicle_type:
    %%   DELIVERY_TRUCK, SERVICE_PICKUP, MOTORCYCLE, UTILITY_VAN

    %% vehicle_status:
    %%   ACTIVE, INACTIVE, UNDER_MAINTENANCE, RETIRED

    %% inspection_result:
    %%   PASSED, NEEDS_ATTENTION, FAILED

    %% incident_severity:
    %%   LOW, MEDIUM, HIGH, CRITICAL

    %% work_order_status:
    %%   PENDING, APPROVED, SCHEDULED, IN_PROGRESS, COMPLETED, CANCELLED

    %% receipt_type:
    %%   PARTS, LABOR, MISC


    %% ==========================================
    %% LOOKUP / DOMAIN TABLES
    %% ==========================================

    MAINTENANCE_TYPES {
        int id PK
        string type_name UK "PREVENTIVE, CORRECTIVE, ACCIDENT_REPAIR, EMERGENCY"
    }

    INCIDENT_TYPES {
        int id PK
        string type_name UK "MECHANICAL_DEFECT, ROAD_ACCIDENT, TIRE_FAILURE, LEAK_ISSUE"
    }


    %% ==========================================
    %% CORE ENTITIES
    %% ==========================================

    USERS {
        uuid id PK
        string username UK
        string first_name
        string last_name
    }

    VEHICLES {
        uuid id PK
        uuid driver_id FK "Nullable, UK (1:1 soft-binding)"
        string vehicle_type "DELIVERY_TRUCK, SERVICE_PICKUP, MOTORCYCLE, UTILITY_VAN"
        string plate_number UK
        string model
        int year_model
        int current_odometer "Running odometer (km)"
        int last_pm_odometer "Odometer at last completed 5k PM"
        boolean pm_due_flag "Stored Generated: (current - last_pm) >= 5000"
        enum status "ACTIVE, INACTIVE, UNDER_MAINTENANCE, RETIRED"
        datetime created_at
        datetime updated_at
    }

    VEHICLE_ODOMETER_LOGS {
        uuid id PK
        uuid vehicle_id FK
        int odometer_reading "Recorded odometer reading"
        uuid logged_by FK "Nullable"
        string source "DEFAULT: POST_DISPATCH_RETURN"
        string notes "Nullable"
        datetime logged_at
    }

    VEHICLE_INSPECTIONS {
        uuid id PK
        uuid vehicle_id FK
        uuid inspector_id FK "Nullable"
        string result "PASSED, NEEDS_ATTENTION, FAILED"
        string findings "Required - defect/symptom notes (No checklist)"
        boolean issue_detected "Default TRUE"
        boolean allow_dispatch "Supervisor discretion flag (Default TRUE)"
        datetime inspection_date
    }

    INCIDENT_REPORTS {
        uuid id PK
        uuid vehicle_id FK
        uuid reporter_id FK "Nullable"
        int incident_type_id FK
        string severity "LOW, MEDIUM, HIGH, CRITICAL"
        datetime report_date
        string incident_location "Nullable"
        string description
    }

    WORK_ORDERS {
        uuid id PK
        uuid vehicle_id FK
        uuid creator_id FK "Nullable"
        string status "PENDING, APPROVED, SCHEDULED, IN_PROGRESS, COMPLETED, CANCELLED"
        int maintenance_type_id FK
        uuid inspection_id FK "Nullable"
        uuid incident_report_id FK "Nullable"
        datetime request_date
        datetime scheduled_date "Nullable"
        string shop_name "Nullable"
        decimal estimated_cost
        string description
        datetime created_at
        datetime updated_at
    }

    APPROVAL_REQUESTS {
        uuid id PK
        uuid work_order_id FK "1:N multi-request supported with pending guard"
        uuid decider_id FK "Nullable"
        datetime requested_date
        datetime decided_date "Nullable"
        decimal amount_requested
        boolean is_approved "Nullable: Pending, True: Approved, False: Rejected"
        string remarks "Nullable"
        datetime created_at
    }

    MAINTENANCE_LOGS {
        uuid id PK
        uuid work_order_id FK "UK (Operational Closing Event)"
        int maintenance_type_id FK
        string severity "LOW, MEDIUM, HIGH, CRITICAL"
        datetime date_started
        datetime date_resolved
        decimal parts_cost
        decimal labor_cost
        decimal total_cost "Stored Generated: parts_cost + labor_cost"
        int downtime_days
        int odometer_at_service
        datetime created_at
    }

    WORK_ORDER_RECEIPTS {
        uuid id PK
        uuid work_order_id FK "0..N supporting audit attachments"
        uuid uploaded_by FK "Nullable"
        string file_url "Audit Evidence URI / Storage path"
        string receipt_number "Nullable"
        string vendor_name "Nullable"
        decimal amount
        string receipt_type "PARTS, LABOR, MISC"
        datetime receipt_date "Nullable"
        datetime created_at
    }


    %% ==========================================
    %% RELATIONSHIPS
    %% ==========================================

    %% Driver assignment
    USERS ||--o| VEHICLES : "assigned to"

    %% Lookup / classification relationships
    MAINTENANCE_TYPES ||--o{ WORK_ORDERS : "classifies"
    MAINTENANCE_TYPES ||--o{ MAINTENANCE_LOGS : "classifies"
    INCIDENT_TYPES ||--o{ INCIDENT_REPORTS : "categorizes"

    %% User actions
    USERS ||--o{ VEHICLE_ODOMETER_LOGS : "logs"
    USERS ||--o{ VEHICLE_INSPECTIONS : "conducts"
    USERS ||--o{ INCIDENT_REPORTS : "reports"
    USERS ||--o{ WORK_ORDERS : "creates"
    USERS ||--o{ APPROVAL_REQUESTS : "decides"
    USERS ||--o{ WORK_ORDER_RECEIPTS : "uploads"

    %% Vehicle relationships
    VEHICLES ||--o{ VEHICLE_ODOMETER_LOGS : "tracks"
    VEHICLES ||--o{ VEHICLE_INSPECTIONS : "undergoes"
    VEHICLES ||--o{ INCIDENT_REPORTS : "involved_in"
    VEHICLES ||--o{ WORK_ORDERS : "serviced_under"

    %% Maintenance workflow
    VEHICLE_INSPECTIONS ||--o| WORK_ORDERS : "initiates"
    INCIDENT_REPORTS ||--o| WORK_ORDERS : "initiates"
    WORK_ORDERS ||--o{ APPROVAL_REQUESTS : "requires"
    WORK_ORDERS ||--o| MAINTENANCE_LOGS : "finalized_as"
    WORK_ORDERS ||--o{ WORK_ORDER_RECEIPTS : "supported_by"
```
