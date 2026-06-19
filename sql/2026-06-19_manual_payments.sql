-- Manual payments (cash, check, Zelle, etc. — not from a connected provider).
-- is_manual flags hand-entered rows so provider syncs never delete them and the
-- UI knows which rows are editable/deletable. created_by records who entered it.

alter table client_payments
  add column if not exists is_manual boolean not null default false;
alter table client_payments
  add column if not exists created_by text;
