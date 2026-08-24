"""One feed, one observation. What a response looked like, and nothing about what it means.

Standard library only, so a judge can run the probe with nothing installed.
"""
import socket, ssl, time, urllib.error, urllib.request
from datetime import datetime, timezone
from urllib.parse import urlparse

UA = "casework-probe/0.2 (transit feed health; +https://github.com/sneg55/casework)"
RANGE_BYTES = 2048
TRANSIENT = {"timeout", "network", "dns_failure"}


def classify(exc, resp_bytes, headers, auth_type):
    """Return (status_class, healthy) for one response. First match wins.

    urllib raises on 4xx and 5xx, so a returned response is a 2xx. Most are 206,
    because every request carries a Range header.
    """
    if exc is not None:
        if isinstance(exc, urllib.error.HTTPError):
            if exc.code in (401, 403) and str(auth_type) not in ("0", "", "None"):
                return "auth_declared", True          # catalog says a key is required
            if exc.code in (401, 403):
                return "auth_rejected", False
            if exc.code == 404:
                return "not_found", False
            return f"http_{exc.code}", False
        reason = getattr(exc, "reason", exc)
        if isinstance(reason, ssl.SSLCertVerificationError):
            return "tls_expired", False
        if isinstance(reason, ssl.SSLError):
            return "tls_error", False
        if isinstance(reason, socket.gaierror):
            return "dns_failure", False
        if isinstance(reason, (TimeoutError, socket.timeout)):
            return "timeout", False
        return "network", False
    ctype = (headers.get("Content-Type") or "").split(";")[0].strip().lower()
    if resp_bytes[:2] == b"PK":
        return "ok", True
    if ctype.startswith("text/") or ctype == "application/json":
        return "content_type_mismatch", False
    return "not_a_zip", False


def fetch(url, timeout):
    req = urllib.request.Request(
        url, headers={"User-Agent": UA, "Range": f"bytes=0-{RANGE_BYTES - 1}"}
    )
    started = time.monotonic()
    try:
        r = urllib.request.urlopen(req, timeout=timeout)
        return None, r.read(RANGE_BYTES), r.headers, r.status, time.monotonic() - started
    except Exception as e:                              # noqa: BLE001 - classified above
        return e, b"", {}, getattr(e, "code", None), time.monotonic() - started


def tls_state(scheme, exc, status):
    """True only when a handshake demonstrably happened, meaning the server answered.
    None when the connection never got that far, because nothing was learned about TLS."""
    if scheme != "https":
        return None
    if status in ("tls_expired", "tls_error"):
        return False
    if exc is None or isinstance(exc, urllib.error.HTTPError):
        return True
    return None


def probe(row, timeout, attempts, run_date):
    """One feed, retried only on transport-level failure. Returns a Detection."""
    url = row["urls.direct_download"]
    for attempt in range(1, attempts + 1):
        exc, body, headers, code, elapsed = fetch(url, timeout)
        status, healthy = classify(exc, body, headers, row.get("urls.authentication_type"))
        if status not in TRANSIENT or attempt == attempts:
            break
    parts = urlparse(url)
    return {
        "run_date": run_date,
        "observed_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "feed_id": row.get("mdb_source_id"),
        "provider": row["provider"],
        "url": url,
        "host": parts.netloc.lower(),
        "path": parts.path,
        "status_class": status,
        "healthy": healthy,
        "http_code": code,
        "content_type": (headers.get("Content-Type") or "") if headers else "",
        "magic_ok": body[:2] == b"PK",
        "tls_ok": tls_state(parts.scheme, exc, status),
        "latency_ms": round(elapsed * 1000),
        "attempts": attempt,
        "auth_type": row.get("urls.authentication_type") or "",
        "catalog_status": row.get("status") or "",
        "redirect_id": row.get("redirect.id") or "",
        "contact_on_file": bool(row.get("feed_contact_email")),   # never the address itself
    }
