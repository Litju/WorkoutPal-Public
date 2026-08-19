-- F4 history is allowed to outlive a revised prescription. Keep the
-- workspace-aware checks on insert/update, while allowing a deleted
-- prescription child to null only its optional global UUID reference.

ALTER TABLE execution.strength_set
  DROP CONSTRAINT IF EXISTS execution_strength_set_prescription_exercise_fk,
  DROP CONSTRAINT IF EXISTS execution_strength_set_prescription_set_fk,
  ADD CONSTRAINT execution_strength_set_prescription_exercise_id_fk
    FOREIGN KEY (prescription_exercise_id)
    REFERENCES design.strength_exercise_prescription (id)
    ON DELETE SET NULL
    NOT VALID,
  ADD CONSTRAINT execution_strength_set_prescription_set_id_fk
    FOREIGN KEY (prescription_set_id)
    REFERENCES design.strength_set_prescription (id)
    ON DELETE SET NULL
    NOT VALID;

ALTER TABLE execution.endurance_segment
  DROP CONSTRAINT IF EXISTS execution_endurance_segment_prescription_fk,
  ADD CONSTRAINT execution_endurance_segment_prescription_id_fk
    FOREIGN KEY (prescription_segment_id)
    REFERENCES design.endurance_segment_prescription (id)
    ON DELETE SET NULL
    NOT VALID;

ALTER TABLE execution.mobility_item
  DROP CONSTRAINT IF EXISTS execution_mobility_item_prescription_fk,
  ADD CONSTRAINT execution_mobility_item_prescription_id_fk
    FOREIGN KEY (prescription_item_id)
    REFERENCES design.mobility_item_prescription (id)
    ON DELETE SET NULL
    NOT VALID;

GRANT USAGE ON SCHEMA assessment, monitoring TO workoutpal_runtime;

CREATE OR REPLACE FUNCTION iam.enforce_execution_prescription_workspace()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'strength_set' THEN
    IF NEW.prescription_exercise_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM design.strength_exercise_prescription
         WHERE workspace_id = NEW.workspace_id
           AND id = NEW.prescription_exercise_id
       ) THEN
      RAISE EXCEPTION 'strength exercise prescription is outside the workspace'
        USING ERRCODE = '23503';
    END IF;
    IF NEW.prescription_set_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM design.strength_set_prescription
         WHERE workspace_id = NEW.workspace_id
           AND id = NEW.prescription_set_id
       ) THEN
      RAISE EXCEPTION 'strength set prescription is outside the workspace'
        USING ERRCODE = '23503';
    END IF;
    IF NEW.prescription_set_id IS NOT NULL
       AND NEW.prescription_exercise_id IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM design.strength_set_prescription
         WHERE workspace_id = NEW.workspace_id
           AND id = NEW.prescription_set_id
           AND exercise_id <> NEW.prescription_exercise_id
       ) THEN
      RAISE EXCEPTION 'strength set prescription does not belong to its exercise'
        USING ERRCODE = '23503';
    END IF;
  ELSIF TG_TABLE_NAME = 'endurance_segment' THEN
    IF NEW.prescription_segment_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM design.endurance_segment_prescription
         WHERE workspace_id = NEW.workspace_id
           AND id = NEW.prescription_segment_id
       ) THEN
      RAISE EXCEPTION 'endurance prescription is outside the workspace'
        USING ERRCODE = '23503';
    END IF;
  ELSIF TG_TABLE_NAME = 'mobility_item' THEN
    IF NEW.prescription_item_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM design.mobility_item_prescription
         WHERE workspace_id = NEW.workspace_id
           AND id = NEW.prescription_item_id
       ) THEN
      RAISE EXCEPTION 'mobility prescription is outside the workspace'
        USING ERRCODE = '23503';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS execution_strength_set_prescription_tenant
  ON execution.strength_set;
DROP TRIGGER IF EXISTS execution_strength_set_prescription_workspace
  ON execution.strength_set;
CREATE TRIGGER execution_strength_set_prescription_workspace
  BEFORE INSERT OR UPDATE OF workspace_id, prescription_exercise_id, prescription_set_id
  ON execution.strength_set
  FOR EACH ROW
  EXECUTE FUNCTION iam.enforce_execution_prescription_workspace();

DROP TRIGGER IF EXISTS execution_endurance_segment_prescription_workspace
  ON execution.endurance_segment;
CREATE TRIGGER execution_endurance_segment_prescription_workspace
  BEFORE INSERT OR UPDATE OF workspace_id, prescription_segment_id
  ON execution.endurance_segment
  FOR EACH ROW
  EXECUTE FUNCTION iam.enforce_execution_prescription_workspace();

DROP TRIGGER IF EXISTS execution_mobility_item_prescription_workspace
  ON execution.mobility_item;
CREATE TRIGGER execution_mobility_item_prescription_workspace
  BEFORE INSERT OR UPDATE OF workspace_id, prescription_item_id
  ON execution.mobility_item
  FOR EACH ROW
  EXECUTE FUNCTION iam.enforce_execution_prescription_workspace();
