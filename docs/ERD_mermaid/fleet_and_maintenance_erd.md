# Fleet & Maintenance Subsystem ERD

> **Domain**: Fleet & Maintenance  
> **Key Rule (No Checklist)**: Inspections are strictly issue-reporting records logged when defects or symptoms are observed. No routine checklists.  
> **PM Threshold**: `(current_odometer - last_pm_odometer) >= 5000 km` triggers scheduled preventive maintenance.

```mermaid
---
config:
  layout: elk
  theme: neutral
---

erDiagram

    %% ==========================================
    %% ENUMS / STATUS CLASSIFICATIONS
    %% ==========================================

    %% truck_status:
    %%   ACTIVE, INACTIVE, UNDER_MAINTENANCE, RETIRED

    %% maintenance_severity:
    %%   LOW, MEDIUM, HIGH, CRITICAL

    %% work_order_status:
    %%   PENDING, APPROVED, SCHEDULED, IN_PROGRESS, COMPLETED, CANCELLED

    %% inspection_result:
    %%   PASSED, NEEDS_ATTENTION, FAILED


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

    TRUCKS {
        uuid id PK
        uuid driver_id FK "Nullable, UK"
        string plate_number UK
        string model
        int year_model
        int current_odometer "Running odometer (km)"
        int last_pm_odometer "Odometer at last completed 5k PM"
        enum status "ACTIVE, INACTIVE, UNDER_MAINTENANCE, RETIRED"
        datetime created_at
        datetime updated_at
    }

    VEHICLE_ODOMETER_LOGS {
        uuid id PK
        uuid truck_id FK
        int odometer_reading "Recorded odometer reading"
        uuid logged_by FK "Nullable"
        string source "DEFAULT: POST_DISPATCH_RETURN"
        string notes "Nullable"
        datetime logged_at
    }

    VEHICLE_INSPECTIONS {
        uuid id PK
        uuid truck_id FK
        uuid inspector_id FK "Nullable"
        string result "PASSED, NEEDS_ATTENTION, FAILED"
        string findings "Required - defect/symptom notes (No checklist)"
        boolean issue_detected "Default TRUE"
        datetime inspection_date
    }

    INCIDENT_REPORTS {
        uuid id PK
        uuid truck_id FK
        uuid reporter_id FK "Nullable"
        int incident_type_id FK
        string severity "LOW, MEDIUM, HIGH, CRITICAL"
        datetime report_date
        string incident_location "Nullable"
        string description
    }

    WORK_ORDERS {
        uuid id PK
        uuid truck_id FK
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
        uuid work_order_id FK "UK"
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
        uuid work_order_id FK "UK"
        int maintenance_type_id FK
        string severity "LOW, MEDIUM, HIGH, CRITICAL"
        datetime date_started
        datetime date_resolved
        decimal parts_cost
        decimal labor_cost
        int downtime_days
        int odometer_at_service
        string official_receipt_number UK
        datetime created_at
    }


    %% ==========================================
    %% RELATIONSHIPS
    %% ==========================================

    %% Driver assignment
    USERS ||--o| TRUCKS : "assigned to"

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

    %% Truck relationships
    TRUCKS ||--o{ VEHICLE_ODOMETER_LOGS : "tracks"
    TRUCKS ||--o{ VEHICLE_INSPECTIONS : "undergoes"
    TRUCKS ||--o{ INCIDENT_REPORTS : "involved_in"
    TRUCKS ||--o{ WORK_ORDERS : "serviced_under"

    %% Maintenance workflow
    VEHICLE_INSPECTIONS ||--o| WORK_ORDERS : "initiates"
    INCIDENT_REPORTS ||--o| WORK_ORDERS : "initiates"
    WORK_ORDERS ||--o| APPROVAL_REQUESTS : "requires"
    WORK_ORDERS ||--o| MAINTENANCE_LOGS : "finalized_as"
```
