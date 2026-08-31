"""Object-storage helper shared by both apps' upload paths.

When ``AWS_S3_BUCKET`` is configured, uploads are sent to S3 (or any
S3-compatible store: Cloudflare R2, MinIO, Backblaze B2) and a public URL is
returned, so images/PDFs are served straight from the bucket/CDN instead of
through the Railway container — removing that CPU and egress from the billed
service. Unset → callers fall back to local disk under UPLOAD_FOLDER.
"""

from __future__ import annotations

import ipaddress
import os
import socket
from urllib.parse import urlparse

from flask import current_app

# MIME types for the S3 Content-Type header.
_CONTENT_TYPE = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "gif": "image/gif",
    "webp": "image/webp",
    "pdf": "application/pdf",
}

# Prefix used for locally-stored uploads (served by the Flask /uploads/ route).
_LOCAL_PREFIX = "uploads/"


def s3_enabled() -> bool:
    """True when an S3 bucket is configured (uploads go to object storage)."""
    return bool(current_app.config.get("AWS_S3_BUCKET"))


def content_type_for(ext: str) -> str:
    """MIME type for a stored file's extension (defaults to octet-stream)."""
    return _CONTENT_TYPE.get(ext.lower().lstrip("."), "application/octet-stream")


def is_remote(file_path: str) -> bool:
    """True for a stored value that is a full URL (an S3/CDN object), as opposed
    to a bare local filename served by the /uploads/ route."""
    return file_path.startswith("http://") or file_path.startswith("https://")


def _s3_client():
    import boto3  # lazy import — only needed when S3 is configured

    cfg = current_app.config
    return boto3.client(
        "s3",
        region_name=cfg.get("AWS_S3_REGION", "us-east-1"),
        aws_access_key_id=cfg.get("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=cfg.get("AWS_SECRET_ACCESS_KEY"),
        endpoint_url=cfg.get("AWS_S3_ENDPOINT_URL"),
    )


def _s3_key(file_path: str) -> str:
    """The object key for a stored value. Keys are flat uuid filenames, so the
    last path segment of the URL is the key regardless of CDN/endpoint prefix."""
    return file_path.rsplit("/", 1)[-1]


def _local_path(file_path: str) -> str:
    """Absolute path on disk for a locally-stored upload."""
    name = file_path[len(_LOCAL_PREFIX):] if file_path.startswith(_LOCAL_PREFIX) else file_path
    return os.path.join(current_app.config["UPLOAD_FOLDER"], name)


def _is_internal_url(url: str) -> bool:
    """True if the URL is missing a host or resolves to a private/loopback/
    link-local/reserved address — an SSRF guard for the remote-fetch fallback.
    Fails closed (returns True) on any resolution error."""
    try:
        host = urlparse(url).hostname
        if not host:
            return True
        for *_, sockaddr in socket.getaddrinfo(host, None):
            ip = ipaddress.ip_address(sockaddr[0])
            if (
                ip.is_private or ip.is_loopback or ip.is_link_local
                or ip.is_reserved or ip.is_multicast or ip.is_unspecified
            ):
                return True
        return False
    except Exception:
        return True


def read_bytes(file_path: str) -> bytes:
    """Read a stored upload's bytes, whether it lives on S3 or local disk.

    Raises FileNotFoundError / botocore errors if the object is missing.
    """
    if is_remote(file_path):
        if s3_enabled():
            obj = _s3_client().get_object(
                Bucket=current_app.config["AWS_S3_BUCKET"], Key=_s3_key(file_path)
            )
            return obj["Body"].read()
        # Remote URL but S3 not configured (e.g. legacy absolute URL): fetch it,
        # but never let a stored value point the server at an internal address.
        if _is_internal_url(file_path):
            raise ValueError("refusing to fetch a non-public URL")
        import requests

        resp = requests.get(file_path, timeout=30)
        resp.raise_for_status()
        return resp.content
    with open(_local_path(file_path), "rb") as fh:
        return fh.read()


def delete_file(file_path: str) -> bool:
    """Delete a stored upload from its backend. Returns True if it was removed
    (or already gone), False if it could not be deleted (e.g. a remote URL with
    no S3 credentials to authorise the delete)."""
    if is_remote(file_path):
        if not s3_enabled():
            return False
        _s3_client().delete_object(
            Bucket=current_app.config["AWS_S3_BUCKET"], Key=_s3_key(file_path)
        )
        return True
    try:
        os.remove(_local_path(file_path))
    except FileNotFoundError:
        pass  # already gone — treat as success so the DB row can be cleared
    return True


def s3_upload(data: bytes, filename: str, ext: str) -> str:
    """Upload bytes to S3 (or any S3-compatible store) and return the public URL.

    Tries to set ACL=public-read; silently retries without the ACL for
    providers that do not support it (Cloudflare R2, MinIO without an ACL
    plugin) — configure a public bucket policy on those instead.
    """
    cfg = current_app.config
    client = _s3_client()
    bucket: str = cfg["AWS_S3_BUCKET"]
    content_type = _CONTENT_TYPE.get(ext, "application/octet-stream")
    # Uploaded files are content-addressed (uuid names) and never rewritten, so
    # the CDN/browser can cache them forever.
    cache_control = "public, max-age=31536000, immutable"

    try:
        client.put_object(
            Bucket=bucket, Key=filename, Body=data,
            ContentType=content_type, CacheControl=cache_control, ACL="public-read",
        )
    except Exception:
        # ACL not supported by this provider — upload without it.
        client.put_object(
            Bucket=bucket, Key=filename, Body=data,
            ContentType=content_type, CacheControl=cache_control,
        )

    # Resolve the public URL: custom CDN prefix → endpoint → standard AWS URL.
    public_url = (cfg.get("AWS_S3_PUBLIC_URL") or "").rstrip("/")
    if public_url:
        return f"{public_url}/{filename}"
    endpoint = (cfg.get("AWS_S3_ENDPOINT_URL") or "").rstrip("/")
    if endpoint:
        return f"{endpoint}/{bucket}/{filename}"
    region = cfg.get("AWS_S3_REGION", "us-east-1")
    return f"https://{bucket}.s3.{region}.amazonaws.com/{filename}"
