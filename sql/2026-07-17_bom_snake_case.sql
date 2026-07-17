-- ─────────────────────────────────────────────────────────────────────────────
-- Normalize client_skus.bom keys to canonical snake_case (matches BOM_KEYS in
-- lib/cogs.js): "FiberTape" → fiber_tape, "3M Sticker" → 3m_sticker,
-- "Double Sided Tape" → double_sided_tape, blackvinyl_yd → black_vinyl_yd,
-- diamondback_yd → diamondback_vinyl_yd, etc. Values are trimmed (kills the
-- "1\r" CSV artifacts) and numeric strings become jsonb numbers.
--
-- Safe to re-run (canonical keys map to themselves). lib/cogs.js reads BOTH
-- shapes via canonBom(), so ordering vs deploy doesn't matter.
-- ─────────────────────────────────────────────────────────────────────────────

update public.client_skus set bom = coalesce((
  select jsonb_object_agg(
    case lower(regexp_replace(t.key, '[^a-zA-Z0-9]', '', 'g'))
      when 'magnetsnorth'          then 'magnets_north'
      when 'magnetssouth'          then 'magnets_south'
      when 'fibertape'             then 'fiber_tape'
      when 'doublesidedtape'       then 'double_sided_tape'
      when 'foamyd'                then 'foam_yd'
      when 'blackvinylyd'          then 'black_vinyl_yd'
      when 'carbonfibervinylyd'    then 'carbon_fiber_vinyl_yd'
      when 'diamondbackyd'         then 'diamondback_vinyl_yd'
      when 'diamondbackvinylyd'    then 'diamondback_vinyl_yd'
      when 'boxsize'               then 'box_size'
      when 'magnetboxsize'         then 'magnet_box_size'
      when 'bagsize'               then 'bag_size'
      when 'packingfoam'           then 'packing_foam'
      when '3msticker'             then '3m_sticker'
      when 'logopatch'             then 'logo_patch'
      when 'usasticker'            then 'usa_sticker'
      when 'shippinglabelsticker'  then 'shipping_label_sticker'
      else t.key
    end,
    case when t.val ~ '^[0-9]+(\.[0-9]+)?$' then to_jsonb(t.val::numeric) else to_jsonb(t.val) end
  )
  from (
    select key, btrim(value, E' \t\r\n') as val
    from jsonb_each_text(bom)
  ) t
), '{}'::jsonb);

-- Spot-check
select parent_sku, bom from public.client_skus where parent_sku = 'UTV-CA-DEF-1';
