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
-- Name: inspection_result; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.inspection_result AS ENUM (
    'PASSED',
    'FAILED',
    'NEEDS_ATTENTION'
);

--
-- Name: maintenance_severity; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.maintenance_severity AS ENUM (
    'LOW',
    'MEDIUM',
    'HIGH',
    'CRITICAL'
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
-- Name: work_order_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.work_order_status AS ENUM (
    'PENDING',
    'APPROVED',
    'SCHEDULED',
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELLED'
);

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: approval_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    work_order_id uuid NOT NULL,
    decider_id uuid,
    requested_date timestamp with time zone DEFAULT now() NOT NULL,
    decided_date timestamp with time zone,
    amount_requested numeric(12,2) NOT NULL,
    is_approved boolean,
    remarks text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
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
-- Name: incident_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.incident_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    truck_id uuid NOT NULL,
    reporter_id uuid NOT NULL,
    incident_type_id uuid NOT NULL,
    severity public.maintenance_severity NOT NULL,
    report_date timestamp with time zone DEFAULT now() NOT NULL,
    incident_location character varying(255) NOT NULL,
    description text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: incident_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.incident_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type_name character varying(100) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: maintenance_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.maintenance_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    work_order_id uuid NOT NULL,
    maintenance_type_id uuid NOT NULL,
    severity public.maintenance_severity NOT NULL,
    date_started timestamp with time zone NOT NULL,
    date_resolved timestamp with time zone,
    parts_cost numeric(12,2) DEFAULT 0.00 NOT NULL,
    labor_cost numeric(12,2) DEFAULT 0.00 NOT NULL,
    downtime_days integer DEFAULT 0 NOT NULL,
    odometer_at_service integer NOT NULL,
    official_receipt_number character varying(100) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "CHK_maintenance_logs_downtime_days" CHECK ((downtime_days >= 0)),
    CONSTRAINT "CHK_maintenance_logs_labor_cost" CHECK ((labor_cost >= (0)::numeric)),
    CONSTRAINT "CHK_maintenance_logs_odometer_at_service" CHECK ((odometer_at_service >= 0)),
    CONSTRAINT "CHK_maintenance_logs_parts_cost" CHECK ((parts_cost >= (0)::numeric))
);

--
-- Name: maintenance_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.maintenance_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type_name character varying(100) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    description text
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
-- Name: trucks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trucks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    driver_id uuid,
    plate_number character varying(20) NOT NULL,
    model character varying(100) NOT NULL,
    year_model integer NOT NULL,
    current_odometer integer DEFAULT 0 NOT NULL,
    last_pm_odometer integer DEFAULT 0 NOT NULL,
    status public.truck_status DEFAULT 'ACTIVE'::public.truck_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "CHK_trucks_current_odometer" CHECK ((current_odometer >= 0)),
    CONSTRAINT "CHK_trucks_last_pm_odometer" CHECK ((last_pm_odometer >= 0))
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
    truck_id uuid NOT NULL,
    inspector_id uuid NOT NULL,
    result public.inspection_result NOT NULL,
    inspection_date timestamp with time zone DEFAULT now() NOT NULL,
    findings text,
    issue_detected boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: work_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.work_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    truck_id uuid NOT NULL,
    creator_id uuid NOT NULL,
    status public.work_order_status DEFAULT 'PENDING'::public.work_order_status NOT NULL,
    maintenance_type_id uuid NOT NULL,
    inspection_id uuid,
    incident_report_id uuid,
    request_date timestamp with time zone DEFAULT now() NOT NULL,
    scheduled_date timestamp with time zone,
    shop_name character varying(150),
    estimated_cost numeric(12,2) DEFAULT 0.00 NOT NULL,
    description text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "CHK_work_orders_estimated_cost" CHECK ((estimated_cost >= (0)::numeric))
);

--
-- Name: schema_migrations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations ALTER COLUMN id SET DEFAULT nextval('public.schema_migrations_id_seq'::regclass);

--
-- Name: approval_requests UQ_approval_requests_work_order_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_requests
    ADD CONSTRAINT "UQ_approval_requests_work_order_id" UNIQUE (work_order_id);

--
-- Name: incident_types UQ_incident_types_type_name; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incident_types
    ADD CONSTRAINT "UQ_incident_types_type_name" UNIQUE (type_name);

--
-- Name: maintenance_logs UQ_maintenance_logs_official_receipt_number; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maintenance_logs
    ADD CONSTRAINT "UQ_maintenance_logs_official_receipt_number" UNIQUE (official_receipt_number);

--
-- Name: maintenance_logs UQ_maintenance_logs_work_order_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maintenance_logs
    ADD CONSTRAINT "UQ_maintenance_logs_work_order_id" UNIQUE (work_order_id);

--
-- Name: maintenance_types UQ_maintenance_types_type_name; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maintenance_types
    ADD CONSTRAINT "UQ_maintenance_types_type_name" UNIQUE (type_name);

--
-- Name: permissions UQ_permissions_name; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT "UQ_permissions_name" UNIQUE (name);

--
-- Name: roles UQ_roles_name; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT "UQ_roles_name" UNIQUE (name);

--
-- Name: trucks UQ_trucks_driver_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trucks
    ADD CONSTRAINT "UQ_trucks_driver_id" UNIQUE (driver_id);

--
-- Name: trucks UQ_trucks_plate_number; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trucks
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
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);

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
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);

--
-- Name: trucks trucks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trucks
    ADD CONSTRAINT trucks_pkey PRIMARY KEY (id);

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
-- Name: work_orders work_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_orders
    ADD CONSTRAINT work_orders_pkey PRIMARY KEY (id);

--
-- Name: IX_approval_requests_decider_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_approval_requests_decider_id" ON public.approval_requests USING btree (decider_id);

--
-- Name: IX_approval_requests_work_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_approval_requests_work_order_id" ON public.approval_requests USING btree (work_order_id);

--
-- Name: IX_incident_reports_incident_type_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_incident_reports_incident_type_id" ON public.incident_reports USING btree (incident_type_id);

--
-- Name: IX_incident_reports_reporter_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_incident_reports_reporter_id" ON public.incident_reports USING btree (reporter_id);

--
-- Name: IX_incident_reports_truck_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_incident_reports_truck_id" ON public.incident_reports USING btree (truck_id);

--
-- Name: IX_maintenance_logs_maintenance_type_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_maintenance_logs_maintenance_type_id" ON public.maintenance_logs USING btree (maintenance_type_id);

--
-- Name: IX_maintenance_logs_work_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_maintenance_logs_work_order_id" ON public.maintenance_logs USING btree (work_order_id);

--
-- Name: IX_trucks_driver_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_trucks_driver_id" ON public.trucks USING btree (driver_id);

--
-- Name: IX_vehicle_inspections_inspector_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_vehicle_inspections_inspector_id" ON public.vehicle_inspections USING btree (inspector_id);

--
-- Name: IX_vehicle_inspections_truck_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_vehicle_inspections_truck_id" ON public.vehicle_inspections USING btree (truck_id);

--
-- Name: IX_work_orders_creator_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_work_orders_creator_id" ON public.work_orders USING btree (creator_id);

--
-- Name: IX_work_orders_maintenance_type_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_work_orders_maintenance_type_id" ON public.work_orders USING btree (maintenance_type_id);

--
-- Name: IX_work_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_work_orders_status" ON public.work_orders USING btree (status);

--
-- Name: IX_work_orders_truck_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_work_orders_truck_id" ON public.work_orders USING btree (truck_id);

--
-- Name: approval_requests FK_approval_requests_decider_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_requests
    ADD CONSTRAINT "FK_approval_requests_decider_id" FOREIGN KEY (decider_id) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: approval_requests FK_approval_requests_work_order_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_requests
    ADD CONSTRAINT "FK_approval_requests_work_order_id" FOREIGN KEY (work_order_id) REFERENCES public.work_orders(id) ON DELETE CASCADE;

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
-- Name: incident_reports FK_incident_reports_incident_type_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incident_reports
    ADD CONSTRAINT "FK_incident_reports_incident_type_id" FOREIGN KEY (incident_type_id) REFERENCES public.incident_types(id) ON DELETE RESTRICT;

--
-- Name: incident_reports FK_incident_reports_reporter_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incident_reports
    ADD CONSTRAINT "FK_incident_reports_reporter_id" FOREIGN KEY (reporter_id) REFERENCES public.users(id) ON DELETE RESTRICT;

--
-- Name: incident_reports FK_incident_reports_truck_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.incident_reports
    ADD CONSTRAINT "FK_incident_reports_truck_id" FOREIGN KEY (truck_id) REFERENCES public.trucks(id) ON DELETE RESTRICT;

--
-- Name: maintenance_logs FK_maintenance_logs_maintenance_type_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maintenance_logs
    ADD CONSTRAINT "FK_maintenance_logs_maintenance_type_id" FOREIGN KEY (maintenance_type_id) REFERENCES public.maintenance_types(id) ON DELETE RESTRICT;

--
-- Name: maintenance_logs FK_maintenance_logs_work_order_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maintenance_logs
    ADD CONSTRAINT "FK_maintenance_logs_work_order_id" FOREIGN KEY (work_order_id) REFERENCES public.work_orders(id) ON DELETE RESTRICT;

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
-- Name: trucks FK_trucks_driver_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trucks
    ADD CONSTRAINT "FK_trucks_driver_id" FOREIGN KEY (driver_id) REFERENCES public.users(id) ON DELETE SET NULL;

--
-- Name: users FK_users_role_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "FK_users_role_id" FOREIGN KEY (role_id) REFERENCES public.roles(id);

--
-- Name: vehicle_inspections FK_vehicle_inspections_inspector_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_inspections
    ADD CONSTRAINT "FK_vehicle_inspections_inspector_id" FOREIGN KEY (inspector_id) REFERENCES public.users(id) ON DELETE RESTRICT;

--
-- Name: vehicle_inspections FK_vehicle_inspections_truck_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_inspections
    ADD CONSTRAINT "FK_vehicle_inspections_truck_id" FOREIGN KEY (truck_id) REFERENCES public.trucks(id) ON DELETE RESTRICT;

--
-- Name: work_orders FK_work_orders_creator_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_orders
    ADD CONSTRAINT "FK_work_orders_creator_id" FOREIGN KEY (creator_id) REFERENCES public.users(id) ON DELETE RESTRICT;

--
-- Name: work_orders FK_work_orders_incident_report_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_orders
    ADD CONSTRAINT "FK_work_orders_incident_report_id" FOREIGN KEY (incident_report_id) REFERENCES public.incident_reports(id) ON DELETE SET NULL;

--
-- Name: work_orders FK_work_orders_inspection_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_orders
    ADD CONSTRAINT "FK_work_orders_inspection_id" FOREIGN KEY (inspection_id) REFERENCES public.vehicle_inspections(id) ON DELETE SET NULL;

--
-- Name: work_orders FK_work_orders_maintenance_type_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_orders
    ADD CONSTRAINT "FK_work_orders_maintenance_type_id" FOREIGN KEY (maintenance_type_id) REFERENCES public.maintenance_types(id) ON DELETE RESTRICT;

--
-- Name: work_orders FK_work_orders_truck_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_orders
    ADD CONSTRAINT "FK_work_orders_truck_id" FOREIGN KEY (truck_id) REFERENCES public.trucks(id) ON DELETE RESTRICT;

--
-- PostgreSQL database dump complete
--
