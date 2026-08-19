-- F5 needs to expose executions recorded without a linked prescription.
-- The execution history remains canonical; these nullable fields preserve the
-- same immutable session record without fabricating a prescription snapshot.
ALTER TABLE execution.session
  ALTER COLUMN prescription_id DROP NOT NULL,
  ALTER COLUMN prescription_version DROP NOT NULL,
  ALTER COLUMN prescription_revision DROP NOT NULL,
  ALTER COLUMN prescription_snapshot DROP NOT NULL,
  ALTER COLUMN snapshot_fingerprint DROP NOT NULL;

ALTER TABLE execution.session
  ADD CONSTRAINT execution_session_prescription_consistency CHECK (
    (prescription_id IS NULL
      AND prescription_version IS NULL
      AND prescription_revision IS NULL
      AND prescription_snapshot IS NULL
      AND snapshot_fingerprint IS NULL)
    OR
    (prescription_id IS NOT NULL
      AND prescription_version IS NOT NULL
      AND prescription_revision IS NOT NULL
      AND prescription_snapshot IS NOT NULL
      AND snapshot_fingerprint IS NOT NULL)
  );
