-- Mark Comfort Pro HVAC as a demo account so it doesn't skew real metrics.
update client
  set status = 'Demo'
  where client_name = 'Comfort Pro HVAC';
