---
title: "The Library Upgrade That Silently Dropped the Client Certificate"
date: "April 2026"
readTime: "4 min"
tags: ["Python", "httpx", "TLS", "Security"]
---

## The setup

The office runs an internal document classification service: a small inference server that takes scanned pages and predicts a label (searchable text, black-and-white text, x-ray image, and a handful of other categories) so the rest of the pipeline knows how to handle each page. It talks to the desktop app over HTTPS, but not plain HTTPS. The inference server requires mutual TLS. It presents a server certificate, and it demands a client certificate back before it will complete the handshake. Uvicorn is configured with `ssl_cert_reqs=CERT_REQUIRED`, so a connection without a valid client cert doesn't get a 401 or a 403. It doesn't get an HTTP response at all. The socket just closes.

The Python side of that handshake lives in one method, `ClassificationClient._get_client`, which lazily builds an `httpx.AsyncClient` the first time it's needed and reuses it after that.

## What broke

After a routine dependency bump brought httpx to 0.28.1, the health check started failing. The client logged `Health check failed: Server disconnected without sending a response`, and the desktop app surfaced it as `Server responded but health check failed`, which is a strange message for a case where nothing came back at all.

The old code looked like this:

```python
if self._config.client_cert_path and self._config.client_key_path:
    kwargs["cert"] = (
        self._config.client_cert_path,
        self._config.client_key_path,
    )
if self._config.ca_cert_path:
    kwargs["verify"] = self._config.ca_cert_path
```

That's the documented shape for older httpx: pass `cert=` as a cert/key tuple, pass `verify=` as a path to a CA bundle, let httpx build the TLS context internally. It had worked for months. Nothing about the mTLS configuration had changed. Only the httpx version had.

httpx 0.28 has a regression where passing both `cert=` and a path-style `verify=` together to `AsyncClient` causes the client certificate chain to get silently omitted from the outbound handshake. No exception, no warning. httpx builds a TLS context from `verify=`, and the `cert=` argument just doesn't make it in. The connection goes out over TLS but without presenting a client cert, and since the server requires one, it closes the socket the moment it doesn't see one. From the outside this looks exactly like a network problem. From the inside, the client is quietly authenticating as nobody.

## The fix

The fix was to stop asking httpx to assemble the TLS context and build it directly with the standard library's `ssl` module instead, then hand httpx the finished `SSLContext` as `verify=`:

```python
ssl_context: Optional[ssl.SSLContext] = None
if self._config.ca_cert_path:
    ssl_context = ssl.create_default_context(cafile=self._config.ca_cert_path)
if self._config.client_cert_path and self._config.client_key_path:
    if ssl_context is None:
        ssl_context = ssl.create_default_context()
    ssl_context.load_cert_chain(
        certfile=self._config.client_cert_path,
        keyfile=self._config.client_key_path,
    )
if ssl_context is not None:
    kwargs["verify"] = ssl_context
```

`create_default_context(cafile=...)` loads the CA bundle. `load_cert_chain` loads the client cert and key onto that same context. httpx just gets a fully-formed `ssl.SSLContext` and uses it as-is, no reassembly, no ambiguity about which of two mutually-exclusive kwargs wins. This is also the shape httpx 1.0 standardizes on going forward, so the fix isn't a workaround, it's an early move to the API that was already the destination.

## Why this one stung

It's a standard case of a library changing how it combines two arguments without telling anyone. What made it worth writing down is where the failure showed up. The authentication step disappeared silently, inside httpx, with no exception and no log line at the point where the cert got dropped. The error only became visible two layers downstream, at the TCP level, as a connection closing with no explanation. Reading the client's exception on its own, I'd have guessed a firewall rule or a certificate expiration before I'd have guessed that the client itself had quietly stopped sending its own certificate.

There's a design decision in the classification client, unrelated to this bug, that kept the whole thing from being worse than it looked. The docstring states it directly: classification is never a blocking failure, and if the server is unreachable or a batch fails after retries, pages default to `bw_text`. That fallback is why a broken mTLS handshake surfaced as a loud, logged health-check failure instead of a silent misclassification somewhere downstream. The pipeline stayed up. It just stopped classifying pages until the fix went in.

Version 1.1.2 shipped with the explicit `SSLContext` construction, verified against the production server before release. The two httpx kwargs that used to configure the same handshake independently now build one object first and hand httpx the finished thing.
