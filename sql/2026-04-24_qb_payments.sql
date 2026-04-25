-- Raw QuickBooks invoice staging table.
-- Independent of client_payments so we can inspect what QB actually returns
-- before deciding how to map invoices to clients.
create table if not exists client_qb_payments (
  id              bigserial primary key,
  realm_id        text not null,
  invoice_id      text not null,
  doc_number      text,
  txn_date        date,
  customer_id     text,
  customer_name   text,
  total_amt       numeric,
  balance         numeric,
  description     text,
  raw             jsonb,
  synced_at       timestamptz default now(),
  unique (realm_id, invoice_id)
);

create index if not exists client_qb_payments_txn_date_idx
  on client_qb_payments (txn_date desc);
