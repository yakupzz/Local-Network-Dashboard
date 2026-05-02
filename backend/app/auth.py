"""
Method-aware bearer-token auth — LAN read-only, write korumalı.

API_TOKEN env var'ı tanımlı ise:
  - GET / HEAD / OPTIONS → token GEREKMİYOR (cihaz izleme herkese açık)
  - POST / PUT / PATCH / DELETE → "Authorization: Bearer <token>" zorunlu
  - İstisna: ping action'ları (mevcut cihazın durumunu kontrol etmek; veride
    kalıcı değişiklik üretmiyor) → token GEREKMİYOR

API_TOKEN tanımsız veya boş ise auth tamamen devre dışı.

WebSocket cihaz durum güncellemelerini yayınlayan read-only akış olduğu için
auth gerektirmez (LAN içinde herkes izleyebilir).
"""
import os
import re
import secrets
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

# Token gerektirmeyen HTTP method'ları (read-only)
_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}

# Write metoduyla çağrılsa bile token gerektirmeyen rotalar.
# Bunlar mevcut cihazları kontrol eder, yeni veri eklemez/değiştirmez.
# (PingLog satırı oluşur ama bu state değişikliği değil, status check'in yan ürünü.)
_EXEMPT_WRITE_ROUTES = [
    ("POST", re.compile(r"^/api/ping/\d+$")),       # tek cihaz ping
    ("POST", re.compile(r"^/api/ping/all/scan$")),  # tüm cihazları yeniden tara
]


def _is_exempt(method: str, path: str) -> bool:
    method = method.upper()
    return any(method == m and rx.match(path) for m, rx in _EXEMPT_WRITE_ROUTES)


def _expected_token() -> str | None:
    tok = os.getenv("API_TOKEN", "").strip()
    return tok or None


# auto_error=False → header yoksa 403 yerine None döner; auth devre dışı modunda bu kritik
_bearer = HTTPBearer(auto_error=False)


def require_api_token(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> None:
    """Yalnızca write isteklerinde (POST/PUT/PATCH/DELETE) token zorunlu."""
    expected = _expected_token()
    if expected is None:
        return  # auth disabled
    if request.method.upper() in _SAFE_METHODS:
        return  # read-only — LAN içinde serbest
    if _is_exempt(request.method, request.url.path):
        return  # status-check write'ları (ping action) — token gerektirmez
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    # secrets.compare_digest: timing-attack korumalı string karşılaştırma
    if not secrets.compare_digest(credentials.credentials, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )


def verify_ws_token(token: str | None) -> bool:
    """
    WebSocket auth — read-only event stream olduğu için her zaman True döner.
    İmza geriye dönük uyumluluk için korunuyor.
    """
    return True
