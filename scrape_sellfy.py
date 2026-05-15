#!/usr/bin/env python3
"""Scrape product gallery images from goalstore-es.sellfy.store"""

import urllib.request
import urllib.error
import re
import json
import time
import sys

SITEMAP_URL = "https://goalstore-es.sellfy.store/sitemap/products.xml?page=1"
IMAGE_PATTERN = re.compile(r'https://media\.sellfy\.store/images/[^"\'\\s]+\.(?:jpg|jpeg|png)', re.IGNORECASE)
TITLE_PATTERN = re.compile(r'<title[^>]*>([^<]+)</title>', re.IGNORECASE)
LOC_PATTERN = re.compile(r'<loc>([^<]+)</loc>')
OUTPUT_FILE = r"C:\Users\tonim\KitZone\sellfy_gallery.json"

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
}

def fetch_url(url, retries=3):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.read().decode('utf-8', errors='replace')
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(2)
            else:
                print(f"  ERROR fetching {url}: {e}", file=sys.stderr)
                return None

def get_product_urls():
    print("Fetching sitemap...", flush=True)
    xml = fetch_url(SITEMAP_URL)
    if not xml:
        return []
    urls = LOC_PATTERN.findall(xml)
    product_urls = [u for u in urls if '/p/' in u]
    print(f"Found {len(product_urls)} product URLs", flush=True)
    return product_urls

def extract_slug(url):
    # Extract the slug from URL like .../p/some-slug-abc123/
    m = re.search(r'/p/([^/]+)/?$', url)
    return m.group(1) if m else url

def scrape_product(url):
    html = fetch_url(url)
    if not html:
        return None, []

    # Extract title
    title_m = TITLE_PATTERN.search(html)
    title = title_m.group(1).strip() if title_m else ""
    # Clean up title (often "Product Name | Store Name")
    if ' | ' in title:
        title = title.split(' | ')[0].strip()
    if ' - ' in title:
        title = title.split(' - ')[0].strip()

    # Extract all media.sellfy.store image URLs
    images = IMAGE_PATTERN.findall(html)
    # Deduplicate while preserving order
    seen = set()
    unique_images = []
    for img in images:
        if img not in seen:
            seen.add(img)
            unique_images.append(img)

    return title, unique_images

def main():
    product_urls = get_product_urls()
    if not product_urls:
        print("No product URLs found!", file=sys.stderr)
        sys.exit(1)

    gallery = {}
    total = len(product_urls)

    for i, url in enumerate(product_urls, 1):
        slug = extract_slug(url)
        print(f"[{i}/{total}] {slug}", flush=True)

        title, images = scrape_product(url)
        if title is not None:
            gallery[slug] = {
                "title": title,
                "url": url,
                "images": images
            }

        # Small delay to be polite
        if i < total:
            time.sleep(0.3)

    print(f"\nScraped {len(gallery)} products total", flush=True)
    print(f"Writing to {OUTPUT_FILE}...", flush=True)

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(gallery, f, ensure_ascii=False, indent=2)

    # Summary stats
    total_images = sum(len(v['images']) for v in gallery.values())
    print(f"Done! {len(gallery)} products, {total_images} images total", flush=True)

if __name__ == '__main__':
    main()
