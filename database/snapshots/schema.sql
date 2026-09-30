--
-- PostgreSQL database dump
--

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

--
-- Name: container_type_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.container_type_enum AS ENUM (
    'CYLINDER',
    'CANISTER'
);

--
-- Name: customer_type_enum; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.customer_type_enum AS ENUM (
    'RETAIL',
    'COMMERCIAL',
    'WHOLESALE'
);

--
-- Name: reconciliation_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.reconciliation_status AS ENUM (
    'AWAITING_SYNC',
    'SETTLED',
    'FLAGGED_VARIANCE'
);

--
-- Name: schedule_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.schedule_status AS ENUM (
    'SCHEDULED',
    'DISPATCHED',
    'CANCELLED'
);

--
-- Name: stock_condition; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.stock_condition AS ENUM (
    'FILLED',
    'EMPTY_GOOD',
    'DEFECTIVE'
);

--
-- Name: transfer_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.transfer_type AS ENUM (
    'DISPATCH_LOAD',
    'RETURN_UNLOAD'
);

--
-- Name: trip_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.trip_status AS ENUM (
    'PENDING',
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELLED'
);

--
-- Name: truck_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.truck_status AS ENUM (
    'ACTIVE',
    'INACTIVE',
    'UNDER_MAINTENANCE',
    'RETIRED'
);

--
-- Name: update_customers_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_customers_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

--
-- Name: update_products_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_products_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

--
-- Name: update_timestamp_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_timestamp_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

--
-- Name: update_trucks_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_trucks_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

--
-- Name: update_vehicles_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_vehicles_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

--
-- Name: update_work_orders_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_work_orders_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: approval_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    work_order_id uuid NOT NULL,
    decider_id uuid,
    requested_date timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    decided_date timestamp with time zone,
    amount_requested numeric(12,2) NOT NULL,
    is_approved boolean,
    remarks text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "CHK_approval_requests_amount_requested" CHECK ((amount_requested >= (0)::numeric))
);

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    target_user_id uuid,
    action character varying(100) NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    address text NOT NULL,
    contact_number character varying(50) NOT NULL,
    customer_type public.customer_type_enum NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: history_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.history_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    user_name character varying(150) NOT NULL,
    user_role character varying(100) NOT NULL,
    action_type character varying(50) NOT NULL,
    module character varying(100) NOT NULL,
    action character varying(100) NOT NULL,
    details text NOT NULL,
    target_id character varying(255),
    target_type character varying(100),
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: incident_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.incident_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vehicle_id uuid CONSTRAINT incident_reports_truck_id_not_null NOT NULL,
    reporter_id uuid,
    incident_type_id integer NOT NULL,
    severity character varying(20) NOT NULL,
    incident_location character varying(255),
    description text NOT NULL,
    report_date timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "CHK_incident_reports_severity" CHECK (((severity)::text = ANY ((ARRAY['LOW'::character varying, 'MEDIUM'::character varying, 'HIGH'::character varying, 'CRITICAL'::character varying])::text[])))
);

--
-- Name: incident_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.incident_types (
    id integer NOT NULL,
    type_name character varying(50) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: incident_types_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.incident_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: incident_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.incident_types_id_seq OWNED BY public.incident_types.id;

--
-- Name: maintenance_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.maintenance_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    work_order_id uuid NOT NULL,
    maintenance_type_id integer NOT NULL,
    severity character varying(20) NOT NULL,
    date_started timestamp with time zone NOT NULL,
    date_resolved timestamp with time zone NOT NULL,
    parts_cost numeric(12,2) DEFAULT 0.00 NOT NULL,
    labor_cost numeric(12,2) DEFAULT 0.00 NOT NULL,
    downtime_days integer DEFAULT 0 NOT NULL,
    odometer_at_service integer NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    total_cost numeric(12,2) GENERATED ALWAYS AS ((parts_cost + labor_cost)) STORED,
    CONSTRAINT "CHK_maintenance_logs_downtime_days" CHECK ((downtime_days >= 0)),
    CONSTRAINT "CHK_maintenance_logs_labor_cost" CHECK ((labor_cost >= (0)::numeric)),
    CONSTRAINT "CHK_maintenance_logs_odometer_at_service" CHECK ((odometer_at_service >= 0)),
    CONSTRAINT "CHK_maintenance_logs_parts_cost" CHECK ((parts_cost >= (0)::numeric)),
    CONSTRAINT "CHK_maintenance_logs_severity" CHECK (((severity)::text = ANY ((ARRAY['LOW'::character varying, 'MEDIUM'::character varying, 'HIGH'::character varying, 'CRITICAL'::character varying])::text[])))
);

--
-- Name: maintenance_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.maintenance_types (
    id integer NOT NULL,
    type_name character varying(50) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: maintenance_types_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.maintenance_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: maintenance_types_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.maintenance_types_id_seq OWNED BY public.maintenance_types.id;

--
-- Name: permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    description text
);

--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    category character varying(100) NOT NULL,
    container_type public.container_type_enum NOT NULL,
    net_weight_kg numeric(6,3) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "CHK_products_net_weight_kg" CHECK ((net_weight_kg > (0)::numeric))
);

--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permissions (
    role_id uuid NOT NULL,
    permission_id uuid NOT NULL
);

--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(50) NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: schedule_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schedule_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    truck_id uuid NOT NULL,
    zone_id uuid NOT NULL,
    day_of_week integer NOT NULL,
    default_sales_user_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT schedule_templates_day_of_week_check CHECK (((day_of_week >= 1) AND (day_of_week <= 7)))
);

--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    id integer NOT NULL,
    filename text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: schema_migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.schema_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

--
-- Name: schema_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.schema_migrations_id_seq OWNED BY public.schema_migrations.id;

--
-- Name: service_zones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_zones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone
);

--
-- Name: trip_load_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trip_load_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    load_id uuid NOT NULL,
    product_id uuid NOT NULL,
    condition public.stock_condition NOT NULL,
    quantity_units integer NOT NULL,
    CONSTRAINT trip_load_items_quantity_units_check CHECK ((quantity_units >= 0))
);

--
-- Name: trip_loads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trip_loads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trip_id uuid NOT NULL,
    transfer_type public.transfer_type NOT NULL,
    slip_number character varying(50) NOT NULL,
    recorded_by uuid,
    recorded_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    remarks text
);

--
-- Name: trip_stock_reconciliations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trip_stock_reconciliations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trip_id uuid NOT NULL,
    verified_by uuid,
    total_loaded_full integer DEFAULT 0 NOT NULL,
    total_sold_full integer DEFAULT 0 NOT NULL,
    total_returned_full integer DEFAULT 0 NOT NULL,
    total_returned_empty_good integer DEFAULT 0 NOT NULL,
    total_returned_defective integer DEFAULT 0 NOT NULL,
    net_customer_debt_created integer DEFAULT 0 NOT NULL,
    status public.reconciliation_status DEFAULT 'AWAITING_SYNC'::public.reconciliation_status NOT NULL,
    supervisor_notes text,
    reconciled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT trip_stock_reconciliations_total_loaded_full_check CHECK ((total_loaded_full >= 0)),
    CONSTRAINT trip_stock_reconciliations_total_returned_defective_check CHECK ((total_returned_defective >= 0)),
    CONSTRAINT trip_stock_reconciliations_total_returned_empty_good_check CHECK ((total_returned_empty_good >= 0)),
    CONSTRAINT trip_stock_reconciliations_total_returned_full_check CHECK ((total_returned_full >= 0)),
    CONSTRAINT trip_stock_reconciliations_total_sold_full_check CHECK ((total_sold_full >= 0))
);

--
-- Name: trips; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trips (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    schedule_id uuid,
    truck_id uuid NOT NULL,
    driver_id uuid NOT NULL,
    sales_user_id uuid NOT NULL,
    zone_id uuid NOT NULL,
    dispatched_by uuid,
    return_odometer_log_id uuid,
    trip_number character varying(50) NOT NULL,
    status public.trip_status DEFAULT 'IN_PROGRESS'::public.trip_status NOT NULL,
    departure_time timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    return_time timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: truck_schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.truck_schedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    scheduled_date date NOT NULL,
    truck_id uuid NOT NULL,
    sales_user_id uuid NOT NULL,
    zone_id uuid NOT NULL,
    created_by uuid,
    status public.schedule_status DEFAULT 'SCHEDULED'::public.schedule_status NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    user_id uuid NOT NULL,
    role_id uuid NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    username character varying(50) NOT NULL,
    password_hash text NOT NULL,
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    phone character varying(20),
    birthdate date,
    role_id uuid NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_blocked boolean DEFAULT false NOT NULL,
    must_change_password boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: vehicle_inspections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vehicle_inspections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vehicle_id uuid CONSTRAINT vehicle_inspections_truck_id_not_null NOT NULL,
    inspector_id uuid,
    result character varying(20) NOT NULL,
    findings text NOT NULL,
    issue_detected boolean DEFAULT true NOT NULL,
    inspection_date timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    allow_dispatch boolean DEFAULT true NOT NULL,
    CONSTRAINT "CHK_vehicle_inspections_result" CHECK (((result)::text = ANY ((ARRAY['PASSED'::character varying, 'NEEDS_ATTENTION'::character varying, 'FAILED'::character varying])::text[])))
);

--
-- Name: vehicle_odometer_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vehicle_odometer_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vehicle_id uuid CONSTRAINT vehicle_odometer_logs_truck_id_not_null NOT NULL,
    odometer_reading integer NOT NULL,
    logged_by uuid,
    source character varying(30) DEFAULT 'POST_DISPATCH_RETURN'::character varying NOT NULL,
    notes text,
    logged_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "CHK_odometer_logs_reading" CHECK ((odometer_reading >= 0))
);

--
-- Name: vehicles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vehicles (
    id uuid DEFAULT gen_random_uuid() CONSTRAINT trucks_id_not_null NOT NULL,
    driver_id uuid,
    plate_number character varying(20) CONSTRAINT trucks_plate_number_not_null NOT NULL,
    model character varying(100) CONSTRAINT trucks_model_not_null NOT NULL,
    year_model integer CONSTRAINT trucks_year_model_not_null NOT NULL,
    current_odometer integer DEFAULT 0 CONSTRAINT trucks_current_odometer_not_null NOT NULL,
    last_pm_odometer integer DEFAULT 0 CONSTRAINT trucks_last_pm_odometer_not_null NOT NULL,
    status public.truck_status DEFAULT 'ACTIVE'::public.truck_status CONSTRAINT trucks_status_not_null NOT NULL,
    created_at timestamp with time zone DEFAULT now() CONSTRAINT trucks_created_at_not_null NOT NULL,
    updated_at timestamp with time zone DEFAULT now() CONSTRAINT trucks_updated_at_not_null NOT NULL,
    vehicle_type character varying(30) DEFAULT 'DELIVERY_TRUCK'::character varying NOT NULL,
    pm_due_flag boolean GENERATED ALWAYS AS (((current_odometer - last_pm_odometer) >= 5000)) STORED,
    CONSTRAINT "CHK_trucks_current_odometer" CHECK ((current_odometer >= 0)),
    CONSTRAINT "CHK_trucks_last_pm_odometer" CHECK ((last_pm_odometer >= 0)),
    CONSTRAINT "CHK_vehicles_vehicle_type" CHECK (((vehicle_type)::text = ANY ((ARRAY['DELIVERY_TRUCK'::character varying, 'SERVICE_PICKUP'::character varying, 'MOTORCYCLE'::character varying, 'UTILITY_VAN'::character varying])::text[])))
);

--
-- Name: work_order_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.work_order_receipts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    work_order_id uuid NOT NULL,
    uploaded_by uuid,
    file_url text NOT NULL,
    receipt_number character varying(100),
    vendor_name character varying(150),
    amount numeric(12,2) DEFAULT 0.00 NOT NULL,
    receipt_type character varying(30) DEFAULT 'PARTS'::character varying NOT NULL,
    receipt_date timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "CHK_work_order_receipts_amount" CHECK ((amount >= (0)::numeric)),
    CONSTRAINT "CHK_work_order_receipts_receipt_type" CHECK (((receipt_type)::text = ANY ((ARRAY['PARTS'::character varying, 'LABOR'::character varying, 'MISC'::character varying])::text[])))
);

--
-- Name: work_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.work_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    vehicle_id uuid CONSTRAINT work_orders_truck_id_not_null NOT NULL,
    creator_id uuid,
    maintenance_type_id integer NOT NULL,
    status character varying(20) DEFAULT 'PENDING'::character varying NOT NULL,
    inspection_id uuid,
    incident_report_id uuid,
    request_date timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    scheduled_date timestamp with time zone,
    shop_name character varying(150),
    estimated_cost numeric(12,2) DEFAULT 0.00 NOT NULL,
    description text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "CHK_work_orders_estimated_cost" CHECK ((estimated_cost >= (0)::numeric)),
    CONSTRAINT "CHK_work_orders_status" CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'APPROVED'::character varying, 'SCHEDULED'::character varying, 'IN_PROGRESS'::character varying, 'COMPLETED'::character varying, 'CANCELLED'::character varying])::text[])))
);

--
-- Name: incident_types id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incident_types ALTER COLUMN id SET DEFAULT nextval('public.incident_types_id_seq'::regclass);

--
-- Name: maintenance_types id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maintenance_types ALTER COLUMN id SET DEFAULT nextval('public.maintenance_types_id_seq'::regclass);

--
-- Name: schema_migrations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations ALTER COLUMN id SET DEFAULT nextval('public.schema_migrations_id_seq'::regclass);

--
-- Name: maintenance_logs UQ_maintenance_logs_work_order_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maintenance_logs
    ADD CONSTRAINT "UQ_maintenance_logs_work_order_id" UNIQUE (work_order_id);

--
-- Name: permissions UQ_permissions_name; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT "UQ_permissions_name" UNIQUE (name);

--
-- Name: products UQ_products_name; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT "UQ_products_name" UNIQUE (name);

--
-- Name: roles UQ_roles_name; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT "UQ_roles_name" UNIQUE (name);

--
-- Name: schedule_templates UQ_schedule_templates_truck_day; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_templates
    ADD CONSTRAINT "UQ_schedule_templates_truck_day" UNIQUE (truck_id, day_of_week);

--
-- Name: truck_schedules UQ_truck_schedules_truck_date; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.truck_schedules
    ADD CONSTRAINT "UQ_truck_schedules_truck_date" UNIQUE (truck_id, scheduled_date);

--
-- Name: vehicles UQ_trucks_driver_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT "UQ_trucks_driver_id" UNIQUE (driver_id);

--
-- Name: vehicles UQ_trucks_plate_number; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT "UQ_trucks_plate_number" UNIQUE (plate_number);

--
-- Name: users UQ_users_username; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "UQ_users_username" UNIQUE (username);

--
-- Name: approval_requests approval_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_requests
    ADD CONSTRAINT approval_requests_pkey PRIMARY KEY (id);

--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);

--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);

--
-- Name: history_logs history_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.history_logs
    ADD CONSTRAINT history_logs_pkey PRIMARY KEY (id);

--
-- Name: incident_reports incident_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incident_reports
    ADD CONSTRAINT incident_reports_pkey PRIMARY KEY (id);

--
-- Name: incident_types incident_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incident_types
    ADD CONSTRAINT incident_types_pkey PRIMARY KEY (id);

--
-- Name: incident_types incident_types_type_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incident_types
    ADD CONSTRAINT incident_types_type_name_key UNIQUE (type_name);

--
-- Name: maintenance_logs maintenance_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maintenance_logs
    ADD CONSTRAINT maintenance_logs_pkey PRIMARY KEY (id);

--
-- Name: maintenance_types maintenance_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maintenance_types
    ADD CONSTRAINT maintenance_types_pkey PRIMARY KEY (id);

--
-- Name: maintenance_types maintenance_types_type_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maintenance_types
    ADD CONSTRAINT maintenance_types_type_name_key UNIQUE (type_name);

--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);

--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);

--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (role_id, permission_id);

--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);

--
-- Name: schedule_templates schedule_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_templates
    ADD CONSTRAINT schedule_templates_pkey PRIMARY KEY (id);

--
-- Name: schema_migrations schema_migrations_filename_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_filename_key UNIQUE (filename);

--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (id);

--
-- Name: service_zones service_zones_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_zones
    ADD CONSTRAINT service_zones_code_key UNIQUE (code);

--
-- Name: service_zones service_zones_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_zones
    ADD CONSTRAINT service_zones_name_key UNIQUE (name);

--
-- Name: service_zones service_zones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_zones
    ADD CONSTRAINT service_zones_pkey PRIMARY KEY (id);

--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);

--
-- Name: trip_load_items trip_load_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_load_items
    ADD CONSTRAINT trip_load_items_pkey PRIMARY KEY (id);

--
-- Name: trip_loads trip_loads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_loads
    ADD CONSTRAINT trip_loads_pkey PRIMARY KEY (id);

--
-- Name: trip_loads trip_loads_slip_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_loads
    ADD CONSTRAINT trip_loads_slip_number_key UNIQUE (slip_number);

--
-- Name: trip_stock_reconciliations trip_stock_reconciliations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_stock_reconciliations
    ADD CONSTRAINT trip_stock_reconciliations_pkey PRIMARY KEY (id);

--
-- Name: trip_stock_reconciliations trip_stock_reconciliations_trip_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_stock_reconciliations
    ADD CONSTRAINT trip_stock_reconciliations_trip_id_key UNIQUE (trip_id);

--
-- Name: trips trips_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_pkey PRIMARY KEY (id);

--
-- Name: trips trips_return_odometer_log_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_return_odometer_log_id_key UNIQUE (return_odometer_log_id);

--
-- Name: trips trips_trip_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_trip_number_key UNIQUE (trip_number);

--
-- Name: truck_schedules truck_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.truck_schedules
    ADD CONSTRAINT truck_schedules_pkey PRIMARY KEY (id);

--
-- Name: vehicles trucks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT trucks_pkey PRIMARY KEY (id);

--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (user_id, role_id);

--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

--
-- Name: vehicle_inspections vehicle_inspections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_inspections
    ADD CONSTRAINT vehicle_inspections_pkey PRIMARY KEY (id);

--
-- Name: vehicle_odometer_logs vehicle_odometer_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_odometer_logs
    ADD CONSTRAINT vehicle_odometer_logs_pkey PRIMARY KEY (id);

--
-- Name: work_order_receipts work_order_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_order_receipts
    ADD CONSTRAINT work_order_receipts_pkey PRIMARY KEY (id);

--
-- Name: work_orders work_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_orders
    ADD CONSTRAINT work_orders_pkey PRIMARY KEY (id);

--
-- Name: IX_approval_requests_is_approved; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_approval_requests_is_approved" ON public.approval_requests USING btree (is_approved);

--
-- Name: IX_approval_requests_work_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_approval_requests_work_order_id" ON public.approval_requests USING btree (work_order_id);

--
-- Name: IX_incident_reports_report_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_incident_reports_report_date" ON public.incident_reports USING btree (report_date);

--
-- Name: IX_incident_reports_severity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_incident_reports_severity" ON public.incident_reports USING btree (severity);

--
-- Name: IX_incident_reports_vehicle_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_incident_reports_vehicle_id" ON public.incident_reports USING btree (vehicle_id);

--
-- Name: IX_maintenance_logs_work_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_maintenance_logs_work_order_id" ON public.maintenance_logs USING btree (work_order_id);

--
-- Name: IX_schedule_templates_day_of_week; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_schedule_templates_day_of_week" ON public.schedule_templates USING btree (day_of_week);

--
-- Name: IX_schedule_templates_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_schedule_templates_is_active" ON public.schedule_templates USING btree (is_active);

--
-- Name: IX_schedule_templates_truck_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_schedule_templates_truck_id" ON public.schedule_templates USING btree (truck_id);

--
-- Name: IX_schedule_templates_zone_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_schedule_templates_zone_id" ON public.schedule_templates USING btree (zone_id);

--
-- Name: IX_service_zones_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_service_zones_code" ON public.service_zones USING btree (code);

--
-- Name: IX_service_zones_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_service_zones_is_active" ON public.service_zones USING btree (is_active);

--
-- Name: IX_trip_load_items_condition; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_trip_load_items_condition" ON public.trip_load_items USING btree (condition);

--
-- Name: IX_trip_load_items_load_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_trip_load_items_load_id" ON public.trip_load_items USING btree (load_id);

--
-- Name: IX_trip_load_items_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_trip_load_items_product_id" ON public.trip_load_items USING btree (product_id);

--
-- Name: IX_trip_loads_slip_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_trip_loads_slip_number" ON public.trip_loads USING btree (slip_number);

--
-- Name: IX_trip_loads_transfer_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_trip_loads_transfer_type" ON public.trip_loads USING btree (transfer_type);

--
-- Name: IX_trip_loads_trip_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_trip_loads_trip_id" ON public.trip_loads USING btree (trip_id);

--
-- Name: IX_trip_stock_reconciliations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_trip_stock_reconciliations_status" ON public.trip_stock_reconciliations USING btree (status);

--
-- Name: IX_trip_stock_reconciliations_trip_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_trip_stock_reconciliations_trip_id" ON public.trip_stock_reconciliations USING btree (trip_id);

--
-- Name: IX_trips_departure_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_trips_departure_time" ON public.trips USING btree (departure_time);

--
-- Name: IX_trips_driver_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_trips_driver_id" ON public.trips USING btree (driver_id);

--
-- Name: IX_trips_sales_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_trips_sales_user_id" ON public.trips USING btree (sales_user_id);

--
-- Name: IX_trips_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_trips_status" ON public.trips USING btree (status);

--
-- Name: IX_trips_truck_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_trips_truck_id" ON public.trips USING btree (truck_id);

--
-- Name: IX_trips_zone_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_trips_zone_id" ON public.trips USING btree (zone_id);

--
-- Name: IX_truck_schedules_sales_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_truck_schedules_sales_user_id" ON public.truck_schedules USING btree (sales_user_id);

--
-- Name: IX_truck_schedules_scheduled_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_truck_schedules_scheduled_date" ON public.truck_schedules USING btree (scheduled_date);

--
-- Name: IX_truck_schedules_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_truck_schedules_status" ON public.truck_schedules USING btree (status);

--
-- Name: IX_truck_schedules_truck_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_truck_schedules_truck_id" ON public.truck_schedules USING btree (truck_id);

--
-- Name: IX_truck_schedules_zone_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_truck_schedules_zone_id" ON public.truck_schedules USING btree (zone_id);

--
-- Name: IX_vehicle_inspections_inspection_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_vehicle_inspections_inspection_date" ON public.vehicle_inspections USING btree (inspection_date);

--
-- Name: IX_vehicle_inspections_result; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_vehicle_inspections_result" ON public.vehicle_inspections USING btree (result);

--
-- Name: IX_vehicle_inspections_vehicle_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_vehicle_inspections_vehicle_id" ON public.vehicle_inspections USING btree (vehicle_id);

--
-- Name: IX_vehicle_odometer_logs_logged_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_vehicle_odometer_logs_logged_at" ON public.vehicle_odometer_logs USING btree (logged_at);

--
-- Name: IX_vehicle_odometer_logs_vehicle_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_vehicle_odometer_logs_vehicle_id" ON public.vehicle_odometer_logs USING btree (vehicle_id);

--
-- Name: IX_vehicles_driver_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_vehicles_driver_id" ON public.vehicles USING btree (driver_id);

--
-- Name: IX_work_order_receipts_receipt_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_work_order_receipts_receipt_type" ON public.work_order_receipts USING btree (receipt_type);

--
-- Name: IX_work_order_receipts_work_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_work_order_receipts_work_order_id" ON public.work_order_receipts USING btree (work_order_id);

--
-- Name: IX_work_orders_maintenance_type_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_work_orders_maintenance_type_id" ON public.work_orders USING btree (maintenance_type_id);

--
-- Name: IX_work_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_work_orders_status" ON public.work_orders USING btree (status);

--
-- Name: IX_work_orders_vehicle_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_work_orders_vehicle_id" ON public.work_orders USING btree (vehicle_id);

--
-- Name: UQ_approval_requests_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "UQ_approval_requests_pending" ON public.approval_requests USING btree (work_order_id) WHERE (is_approved IS NULL);

--
-- Name: UQ_trips_schedule_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "UQ_trips_schedule_id" ON public.trips USING btree (schedule_id) WHERE (schedule_id IS NOT NULL);

--
-- Name: idx_customers_customer_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_customer_type ON public.customers USING btree (customer_type);

--
-- Name: idx_customers_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_is_active ON public.customers USING btree (is_active);

--
-- Name: idx_customers_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_name ON public.customers USING btree (name);

--
-- Name: idx_history_logs_action_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_history_logs_action_type ON public.history_logs USING btree (action_type);

--
-- Name: idx_history_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_history_logs_created_at ON public.history_logs USING btree (created_at DESC);

--
-- Name: idx_history_logs_module; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_history_logs_module ON public.history_logs USING btree (module);

--
-- Name: idx_history_logs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_history_logs_user_id ON public.history_logs USING btree (user_id);

--
-- Name: idx_user_roles_role_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_roles_role_id ON public.user_roles USING btree (role_id);

--
-- Name: idx_user_roles_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_roles_user_id ON public.user_roles USING btree (user_id);

--
-- Name: customers trigger_update_customers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_customers_updated_at_column();

--
-- Name: products trigger_update_products_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_products_updated_at_column();

--
-- Name: schedule_templates trigger_update_schedule_templates_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_schedule_templates_updated_at BEFORE UPDATE ON public.schedule_templates FOR EACH ROW EXECUTE FUNCTION public.update_timestamp_column();

--
-- Name: service_zones trigger_update_service_zones_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_service_zones_updated_at BEFORE UPDATE ON public.service_zones FOR EACH ROW EXECUTE FUNCTION public.update_timestamp_column();

--
-- Name: trip_stock_reconciliations trigger_update_trip_stock_reconciliations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_trip_stock_reconciliations_updated_at BEFORE UPDATE ON public.trip_stock_reconciliations FOR EACH ROW EXECUTE FUNCTION public.update_timestamp_column();

--
-- Name: trips trigger_update_trips_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_trips_updated_at BEFORE UPDATE ON public.trips FOR EACH ROW EXECUTE FUNCTION public.update_timestamp_column();

--
-- Name: truck_schedules trigger_update_truck_schedules_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_truck_schedules_updated_at BEFORE UPDATE ON public.truck_schedules FOR EACH ROW EXECUTE FUNCTION public.update_timestamp_column();

--
-- Name: vehicles trigger_update_vehicles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_vehicles_updated_at BEFORE UPDATE ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.update_vehicles_updated_at_column();

--
-- Name: work_orders trigger_update_work_orders_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_work_orders_updated_at BEFORE UPDATE ON public.work_orders FOR EACH ROW EXECUTE FUNCTION public.update_work_orders_updated_at_column();

--
-- Name: audit_logs FK_audit_logs_target_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT "FK_audit_logs_target_user_id" FOREIGN KEY (target_user_id) REFERENCES public.users(id);

--
-- Name: audit_logs FK_audit_logs_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT "FK_audit_logs_user_id" FOREIGN KEY (user_id) REFERENCES public.users(id);

--
-- Name: history_logs FK_history_logs_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.history_logs
    ADD CONSTRAINT "FK_history_logs_user_id" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: role_permissions FK_role_permissions_permission_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT "FK_role_permissions_permission_id" FOREIGN KEY (permission_id) REFERENCES public.permissions(id);

--
-- Name: role_permissions FK_role_permissions_role_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT "FK_role_permissions_role_id" FOREIGN KEY (role_id) REFERENCES public.roles(id);

--
-- Name: sessions FK_sessions_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT "FK_sessions_user_id" FOREIGN KEY (user_id) REFERENCES public.users(id);

--
-- Name: vehicles FK_trucks_driver_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicles
    ADD CONSTRAINT "FK_trucks_driver_id" FOREIGN KEY (driver_id) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: user_roles FK_user_roles_role_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT "FK_user_roles_role_id" FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE RESTRICT;

--
-- Name: user_roles FK_user_roles_user_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT "FK_user_roles_user_id" FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: users FK_users_role_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "FK_users_role_id" FOREIGN KEY (role_id) REFERENCES public.roles(id);

--
-- Name: approval_requests approval_requests_decider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_requests
    ADD CONSTRAINT approval_requests_decider_id_fkey FOREIGN KEY (decider_id) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: approval_requests approval_requests_work_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_requests
    ADD CONSTRAINT approval_requests_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES public.work_orders(id) ON DELETE CASCADE;

--
-- Name: incident_reports incident_reports_incident_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incident_reports
    ADD CONSTRAINT incident_reports_incident_type_id_fkey FOREIGN KEY (incident_type_id) REFERENCES public.incident_types(id) ON DELETE RESTRICT;

--
-- Name: incident_reports incident_reports_reporter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incident_reports
    ADD CONSTRAINT incident_reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: incident_reports incident_reports_truck_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incident_reports
    ADD CONSTRAINT incident_reports_truck_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE CASCADE;

--
-- Name: maintenance_logs maintenance_logs_maintenance_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maintenance_logs
    ADD CONSTRAINT maintenance_logs_maintenance_type_id_fkey FOREIGN KEY (maintenance_type_id) REFERENCES public.maintenance_types(id) ON DELETE RESTRICT;

--
-- Name: maintenance_logs maintenance_logs_work_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maintenance_logs
    ADD CONSTRAINT maintenance_logs_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES public.work_orders(id) ON DELETE CASCADE;

--
-- Name: schedule_templates schedule_templates_default_sales_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_templates
    ADD CONSTRAINT schedule_templates_default_sales_user_id_fkey FOREIGN KEY (default_sales_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: schedule_templates schedule_templates_truck_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_templates
    ADD CONSTRAINT schedule_templates_truck_id_fkey FOREIGN KEY (truck_id) REFERENCES public.vehicles(id) ON DELETE CASCADE;

--
-- Name: schedule_templates schedule_templates_zone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_templates
    ADD CONSTRAINT schedule_templates_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES public.service_zones(id) ON DELETE RESTRICT;

--
-- Name: trip_load_items trip_load_items_load_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_load_items
    ADD CONSTRAINT trip_load_items_load_id_fkey FOREIGN KEY (load_id) REFERENCES public.trip_loads(id) ON DELETE CASCADE;

--
-- Name: trip_load_items trip_load_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_load_items
    ADD CONSTRAINT trip_load_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;

--
-- Name: trip_loads trip_loads_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_loads
    ADD CONSTRAINT trip_loads_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: trip_loads trip_loads_trip_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_loads
    ADD CONSTRAINT trip_loads_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;

--
-- Name: trip_stock_reconciliations trip_stock_reconciliations_trip_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_stock_reconciliations
    ADD CONSTRAINT trip_stock_reconciliations_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trips(id) ON DELETE CASCADE;

--
-- Name: trip_stock_reconciliations trip_stock_reconciliations_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trip_stock_reconciliations
    ADD CONSTRAINT trip_stock_reconciliations_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: trips trips_dispatched_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_dispatched_by_fkey FOREIGN KEY (dispatched_by) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: trips trips_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.users(id) ON DELETE RESTRICT;

--
-- Name: trips trips_return_odometer_log_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_return_odometer_log_id_fkey FOREIGN KEY (return_odometer_log_id) REFERENCES public.vehicle_odometer_logs(id) ON DELETE SET NULL;

--
-- Name: trips trips_sales_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_sales_user_id_fkey FOREIGN KEY (sales_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;

--
-- Name: trips trips_schedule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES public.truck_schedules(id) ON DELETE SET NULL;

--
-- Name: trips trips_truck_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_truck_id_fkey FOREIGN KEY (truck_id) REFERENCES public.vehicles(id) ON DELETE RESTRICT;

--
-- Name: trips trips_zone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trips
    ADD CONSTRAINT trips_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES public.service_zones(id) ON DELETE RESTRICT;

--
-- Name: truck_schedules truck_schedules_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.truck_schedules
    ADD CONSTRAINT truck_schedules_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: truck_schedules truck_schedules_sales_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.truck_schedules
    ADD CONSTRAINT truck_schedules_sales_user_id_fkey FOREIGN KEY (sales_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;

--
-- Name: truck_schedules truck_schedules_truck_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.truck_schedules
    ADD CONSTRAINT truck_schedules_truck_id_fkey FOREIGN KEY (truck_id) REFERENCES public.vehicles(id) ON DELETE RESTRICT;

--
-- Name: truck_schedules truck_schedules_zone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.truck_schedules
    ADD CONSTRAINT truck_schedules_zone_id_fkey FOREIGN KEY (zone_id) REFERENCES public.service_zones(id) ON DELETE RESTRICT;

--
-- Name: vehicle_inspections vehicle_inspections_inspector_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_inspections
    ADD CONSTRAINT vehicle_inspections_inspector_id_fkey FOREIGN KEY (inspector_id) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: vehicle_inspections vehicle_inspections_truck_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_inspections
    ADD CONSTRAINT vehicle_inspections_truck_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE CASCADE;

--
-- Name: vehicle_odometer_logs vehicle_odometer_logs_logged_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_odometer_logs
    ADD CONSTRAINT vehicle_odometer_logs_logged_by_fkey FOREIGN KEY (logged_by) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: vehicle_odometer_logs vehicle_odometer_logs_truck_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_odometer_logs
    ADD CONSTRAINT vehicle_odometer_logs_truck_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE CASCADE;

--
-- Name: work_order_receipts work_order_receipts_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_order_receipts
    ADD CONSTRAINT work_order_receipts_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: work_order_receipts work_order_receipts_work_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_order_receipts
    ADD CONSTRAINT work_order_receipts_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES public.work_orders(id) ON DELETE CASCADE;

--
-- Name: work_orders work_orders_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_orders
    ADD CONSTRAINT work_orders_creator_id_fkey FOREIGN KEY (creator_id) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: work_orders work_orders_incident_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_orders
    ADD CONSTRAINT work_orders_incident_report_id_fkey FOREIGN KEY (incident_report_id) REFERENCES public.incident_reports(id) ON DELETE SET NULL;

--
-- Name: work_orders work_orders_inspection_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_orders
    ADD CONSTRAINT work_orders_inspection_id_fkey FOREIGN KEY (inspection_id) REFERENCES public.vehicle_inspections(id) ON DELETE SET NULL;

--
-- Name: work_orders work_orders_maintenance_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_orders
    ADD CONSTRAINT work_orders_maintenance_type_id_fkey FOREIGN KEY (maintenance_type_id) REFERENCES public.maintenance_types(id) ON DELETE RESTRICT;

--
-- Name: work_orders work_orders_truck_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_orders
    ADD CONSTRAINT work_orders_truck_id_fkey FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE CASCADE;

--
-- PostgreSQL database dump complete
--
