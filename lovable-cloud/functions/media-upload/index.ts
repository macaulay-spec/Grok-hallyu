// =============================================================================
// HALLYU — LOVABLE CLOUD EDGE FUNCTION
// media-upload/index.ts
// Mints signed upload URLs for avatars, banners, post-images, and shorts-videos
// and registers uploaded assets in public.media_assets.
// =============================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BUCKET_LIMITS: Record<string, number> = {
  avatars: 5 * 1024 * 1024,
  banners: 10 * 1024 * 1024,
  'post-images': 15 * 1024 * 1024,
  'shorts-videos': 100 * 1024 * 1024,
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization') ?? '';

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData, error: authErr } = await userClient.auth.getUser();
    if (authErr || !authData.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = authData.user.id;
    const { bucket = 'shorts-videos', ext = 'mp4', mimeType = 'video/mp4', sizeBytes = 0, postId = null } =
      await req.json();

    const maxBytes = BUCKET_LIMITS[bucket];
    if (!maxBytes) {
      return new Response(JSON.stringify({ error: 'Invalid storage bucket' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (sizeBytes <= 0 || sizeBytes > maxBytes) {
      return new Response(JSON.stringify({ error: `File size exceeds limit for ${bucket}` }), {
        status: 413,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cleanExt = String(ext).replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
    const key = `${userId}/${crypto.randomUUID()}.${cleanExt}`;

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: signed, error: signErr } = await admin.storage.from(bucket).createSignedUploadUrl(key);
    if (signErr || !signed) {
      throw signErr ?? new Error('Could not create signed upload URL');
    }

    await admin.from('media_assets').insert({
      key: `${bucket}/${key}`,
      owner_id: userId,
      bucket,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      post_id: postId,
    });

    const { data: pub } = admin.storage.from(bucket).getPublicUrl(key);

    return new Response(
      JSON.stringify({
        ok: true,
        bucket,
        key,
        signedUrl: signed.signedUrl,
        token: signed.token,
        publicUrl: pub.publicUrl,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Upload broker failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
