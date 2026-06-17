# Signature Background Removal Helper

Local-only optional helper for the prototype signature background removal dropdown.

The frontend calls:

```text
POST http://127.0.0.1:8000/remove-background
```

This service uses `rembg` locally. It does not call an external API.

## Setup

```powershell
cd "C:\Users\ivanlaurente\Desktop\Hans Files\GatePassSystem\Backend\SignatureBackgroundRemoval"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn app:app --host 127.0.0.1 --port 8000
```

Then choose `AI remove bg via local Python server` in the signature dropdown.

If the helper is not running, the frontend falls back to the browser-only auto remover.
