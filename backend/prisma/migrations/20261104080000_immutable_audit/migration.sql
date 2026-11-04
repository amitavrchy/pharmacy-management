-- Audit entries are append-only even if application code accidentally attempts mutation.
CREATE FUNCTION reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Audit entries are immutable';
END;
$$;
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON "AuditEntry"
FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();
