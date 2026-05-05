import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024,
    files: 16
  }
});

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const imageModels = new Set(['gpt-image-2.0', 'gpt-image-1.5', 'gpt-image-1', 'gpt-image-1-mini']);
const imageSizes = new Set(['auto', '1024x1024', '1536x1024', '1024x1536', '1536x864']);
const imageQualities = new Set(['auto', 'low', 'medium', 'high']);
const outputFormats = new Set(['png', 'jpeg', 'webp']);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, hasApiKey: Boolean(process.env.OPENAI_API_KEY) });
});

app.post('/api/generate', upload.array('references', 16), async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(400).json({
        error: 'Missing OPENAI_API_KEY. Add it to a .env file or your shell environment.'
      });
    }

    const prompt = String(req.body.prompt || '').trim();
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required.' });
    }

    const model = sanitize(req.body.model, imageModels, 'gpt-image-1.5');
    const n = clamp(Number(req.body.count || 1), 1, 10);
    const size = sanitize(req.body.size, imageSizes, '1024x1024');
    const quality = sanitize(req.body.quality, imageQualities, 'auto');
    const output_format = sanitize(req.body.outputFormat, outputFormats, 'png');
    const background = sanitize(req.body.background, new Set(['auto', 'opaque', 'transparent']), 'auto');
    const moderation = sanitize(req.body.moderation, new Set(['auto', 'low']), 'auto');
    const input_fidelity = sanitize(req.body.inputFidelity, new Set(['low', 'high']), 'low');

    const form = new FormData();
    form.append('model', model);
    form.append('prompt', prompt);
    form.append('n', String(n));
    form.append('size', size);
    form.append('quality', quality);
    form.append('output_format', output_format);
    form.append('background', background);
    form.append('moderation', moderation);

    const hasReferences = req.files && req.files.length > 0;
    const endpoint = hasReferences ? 'https://api.openai.com/v1/images/edits' : 'https://api.openai.com/v1/images/generations';

    if (hasReferences) {
      form.append('input_fidelity', input_fidelity);
      for (const file of req.files) {
        const blob = new Blob([file.buffer], { type: file.mimetype });
        form.append('image[]', blob, file.originalname);
      }
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      body: form
    });

    const json = await response.json();
    if (!response.ok) {
      const message = json?.error?.message || 'Image generation failed.';
      return res.status(response.status).json({ error: message, details: json });
    }

    res.json({
      created: json.created,
      outputFormat: json.output_format || output_format,
      images: (json.data || []).map((item, index) => ({
        id: `${Date.now()}-${index}`,
        b64: item.b64_json,
        url: item.url,
        revisedPrompt: item.revised_prompt || ''
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Unexpected server error.' });
  }
});

app.listen(port, host, () => {
  console.log(`Image 2 Studio running at http://${host}:${port}`);
});

function sanitize(value, allowed, fallback) {
  const normalized = String(value || fallback);
  return allowed.has(normalized) ? normalized : fallback;
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}
