-- Review on an isolated QA database first. Never applied by application startup.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='guests' AND column_name='eta_at')
    OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='guests' AND column_name='seated_at') THEN
    RAISE EXCEPTION 'Install existing manual ETA and core support migrations first';
  END IF;
END $$;
CREATE TABLE public.staff_activity_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id INTEGER,
  event TEXT NOT NULL,
  guest_id INTEGER,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX staff_activity_recent ON public.staff_activity_events(created_at DESC,id DESC);
-- Deliberately no FK to guests: samples contain no names/phones and survive guest cleanup.
CREATE TABLE public.wait_accuracy_samples (
  booking_id INTEGER PRIMARY KEY,
  seated_at TIMESTAMPTZ NOT NULL,
  actual_wait_minutes DOUBLE PRECISION NOT NULL CHECK(actual_wait_minutes >= 0),
  eta_error_minutes DOUBLE PRECISION
);
CREATE INDEX wait_accuracy_recent ON public.wait_accuracy_samples(seated_at DESC);
CREATE FUNCTION public.record_guest_operations() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE actor INTEGER; joined TIMESTAMPTZ;
BEGIN
  actor := NULLIF(current_setting('mo_bistro.actor_id',true),'')::INTEGER;
  IF NEW.status IS DISTINCT FROM OLD.status OR NEW.confirmed IS DISTINCT FROM OLD.confirmed
    OR NEW.table_id IS DISTINCT FROM OLD.table_id OR NEW.eta_at IS DISTINCT FROM OLD.eta_at THEN
    INSERT INTO public.staff_activity_events(actor_id,event,guest_id,details)
    VALUES (actor,'booking_updated',NEW.id,jsonb_build_object(
      'from_status',OLD.status,'to_status',NEW.status,
      'confirmed',NEW.confirmed,'table_id',NEW.table_id,
      'eta_changed',NEW.eta_at IS DISTINCT FROM OLD.eta_at));
  END IF;
  IF NEW.status='seated' AND OLD.status <> 'seated' AND NEW.seated_at IS NOT NULL THEN
    -- Legacy malformed creation times must not break seating; no fabricated sample.
    BEGIN joined := NEW.created_at::TIMESTAMPTZ;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN joined := NULL;
    END;
    IF joined IS NOT NULL AND joined <= NEW.seated_at THEN
      INSERT INTO public.wait_accuracy_samples(booking_id,seated_at,actual_wait_minutes,eta_error_minutes)
      VALUES (NEW.id,NEW.seated_at,EXTRACT(EPOCH FROM NEW.seated_at-joined)/60,
        CASE WHEN OLD.eta_at IS NOT NULL THEN EXTRACT(EPOCH FROM NEW.seated_at-OLD.eta_at)/60 END)
      ON CONFLICT(booking_id) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guest_operations_after_update AFTER UPDATE ON public.guests
FOR EACH ROW EXECUTE FUNCTION public.record_guest_operations();
CREATE FUNCTION public.record_waitlist_pause() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.key='public_waitlist_paused' AND (TG_OP='INSERT' OR NEW.value IS DISTINCT FROM OLD.value) THEN
    INSERT INTO public.staff_activity_events(actor_id,event,details)
    VALUES (NULLIF(current_setting('mo_bistro.actor_id',true),'')::INTEGER,
      'public_waitlist_changed',jsonb_build_object('paused',NEW.value='true'));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER waitlist_pause_after_change AFTER INSERT OR UPDATE ON public.restaurant_settings
FOR EACH ROW EXECUTE FUNCTION public.record_waitlist_pause();
CREATE FUNCTION public.record_inventory_operations() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE detail JSONB;
BEGIN
  IF TG_TABLE_NAME='restaurant_tables' THEN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
    detail := jsonb_build_object('table_id',NEW.id,'from_status',OLD.status,'to_status',NEW.status);
  ELSE
    IF NEW.occupied_tables IS NOT DISTINCT FROM OLD.occupied_tables THEN RETURN NEW; END IF;
    detail := jsonb_build_object('area',NEW.area,'from_occupied',OLD.occupied_tables,'to_occupied',NEW.occupied_tables);
  END IF;
  INSERT INTO public.staff_activity_events(actor_id,event,details)
  VALUES (NULLIF(current_setting('mo_bistro.actor_id',true),'')::INTEGER,'inventory_updated',detail);
  RETURN NEW;
END;
$$;
CREATE TRIGGER named_inventory_after_update AFTER UPDATE ON public.restaurant_tables
FOR EACH ROW EXECUTE FUNCTION public.record_inventory_operations();
CREATE TRIGGER simple_inventory_after_update AFTER UPDATE ON public.simple_table_capacity
FOR EACH ROW EXECUTE FUNCTION public.record_inventory_operations();
COMMIT;
