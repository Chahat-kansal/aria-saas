-- Create media storage bucket for AI-generated images, videos, and voiceovers
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media',
  'media',
  true,
  52428800, -- 50 MB
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'audio/mpeg', 'audio/wav', 'audio/ogg']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 52428800,
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'audio/mpeg', 'audio/wav', 'audio/ogg'];

-- Allow authenticated users to read all objects (bucket is public)
create policy if not exists "media_public_read"
  on storage.objects for select
  using (bucket_id = 'media');

-- Allow service role to upload (used by server-side AI generation)
create policy if not exists "media_service_insert"
  on storage.objects for insert
  with check (bucket_id = 'media');

-- Allow users to delete their own uploads
create policy if not exists "media_owner_delete"
  on storage.objects for delete
  using (bucket_id = 'media' and auth.uid()::text = (storage.foldername(name))[2]);
