-- Add youtube_channel_id to client table
alter table client add column if not exists youtube_channel_id text;

-- Set Synergy Home channel
update client
set youtube_channel_id = 'UCvR1MnPiAqNevXloj2vgliQ'
where client_id = 'ch014';
