from http.server import BaseHTTPRequestHandler
import base64
import io
import json
import os
import wave

import riva.client

FUNCTION_ID = "71203149-d3b7-4460-8231-1be2543a1fca"
GRPC_URI = "grpc.nvcf.nvidia.com:443"


def _json_response(handler, status, payload):
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def _wav_to_pcm(audio_bytes):
    with wave.open(io.BytesIO(audio_bytes), "rb") as wav:
        if wav.getnchannels() != 1 or wav.getsampwidth() != 2:
            raise ValueError("NVIDIA ASR attend un WAV mono 16-bit. Convertis l'audio ou utilise Whisper.")
        return wav.readframes(wav.getnframes()), wav.getframerate(), riva.client.AudioEncoding.LINEAR_PCM


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        api_key = os.environ.get("NVIDIA_API_KEY")
        if not api_key:
            return _json_response(self, 500, {"error": "NVIDIA_API_KEY manquante cote serveur."})

        try:
            length = int(self.headers.get("content-length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
            audio_b64 = payload.get("audioBase64") or ""
            if not audio_b64:
                return _json_response(self, 400, {"error": "audioBase64 manquant."})

            audio_bytes = base64.b64decode(audio_b64)
            mime = (payload.get("mimeType") or "").lower()
            filename = (payload.get("filename") or "").lower()

            if "wav" in mime or filename.endswith(".wav"):
                audio_payload, sample_rate, encoding = _wav_to_pcm(audio_bytes)
            elif "ogg" in mime or filename.endswith(".ogg") or filename.endswith(".opus"):
                audio_payload, sample_rate, encoding = audio_bytes, 48000, riva.client.AudioEncoding.OGGOPUS
            else:
                return _json_response(
                    self,
                    415,
                    {"error": "NVIDIA ASR accepte surtout WAV mono 16-bit ou OGG/OPUS. Pour WebM/MP4, garde Whisper."},
                )

            auth = riva.client.Auth(
                uri=GRPC_URI,
                use_ssl=True,
                metadata_args=[
                    ["authorization", f"Bearer {api_key}"],
                    ["function-id", FUNCTION_ID],
                ],
            )
            service = riva.client.ASRService(auth)
            config = riva.client.RecognitionConfig(
                encoding=encoding,
                sample_rate_hertz=sample_rate,
                language_code=payload.get("language") or "multi",
                max_alternatives=1,
                enable_automatic_punctuation=True,
            )
            response = service.offline_recognize(audio_payload, config)
            text = ""
            if response.results:
                alternatives = response.results[0].alternatives
                if alternatives:
                    text = alternatives[0].transcript or ""
            return _json_response(self, 200, {"text": text.strip()})
        except Exception as error:
            return _json_response(self, 500, {"error": str(error)})
