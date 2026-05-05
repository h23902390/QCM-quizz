const NVIDIA_ASR_ENDPOINT = 'https://integrate.api.nvidia.com/v1/audio/transcriptions';
const NVIDIA_ASR_MODEL = 'nvidia/parakeet-1_1b-rnnt-multilingual-asr';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'NVIDIA_API_KEY manquante cote serveur.' });
  }

  try {
    const payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const audioBase64 = payload.audioBase64 || '';
    if (!audioBase64) return res.status(400).json({ error: 'audioBase64 manquant.' });

    const buffer = Buffer.from(audioBase64, 'base64');
    const blob = new Blob([buffer], { type: payload.mimeType || 'audio/webm' });
    const form = new FormData();
    form.append('file', blob, payload.filename || 'audio.webm');
    form.append('model', payload.model || NVIDIA_ASR_MODEL);
    form.append('language', payload.language || 'multi');
    form.append('response_format', 'json');

    const upstream = await fetch(NVIDIA_ASR_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    return res.send(text);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Erreur NVIDIA ASR.' });
  }
}
