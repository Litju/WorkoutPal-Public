-- Performed facts preserve the prescription UUID used for historical
-- matching, even after a later prescription revision removes the child row.
-- Tenant correctness is enforced when a new fact reference is written by the
-- workspace-aware trigger from 0008; a hard FK would erase valid history.

ALTER TABLE execution.strength_set
  DROP CONSTRAINT IF EXISTS execution_strength_set_prescription_exercise_id_fk,
  DROP CONSTRAINT IF EXISTS execution_strength_set_prescription_set_id_fk,
  DROP CONSTRAINT IF EXISTS execution_strength_set_prescription_exercise_fk,
  DROP CONSTRAINT IF EXISTS execution_strength_set_prescription_set_fk;

ALTER TABLE execution.endurance_segment
  DROP CONSTRAINT IF EXISTS execution_endurance_segment_prescription_id_fk,
  DROP CONSTRAINT IF EXISTS execution_endurance_segment_prescription_fk;

ALTER TABLE execution.mobility_item
  DROP CONSTRAINT IF EXISTS execution_mobility_item_prescription_id_fk,
  DROP CONSTRAINT IF EXISTS execution_mobility_item_prescription_fk;
