"""Create private, metadata-free app copies from an audited photo manifest.

Requires Pillow. The output directory must not exist. Original files are read only.
"""

import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageOps


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def copy_for_app(source, destination, longest_edge, quality):
    with Image.open(source) as image:
        if image.format not in ('JPEG', 'MPO'):
            raise ValueError(f'Not JPEG-compatible: {source}')
        # Some camera JPGs contain an MPO secondary frame. The primary
        # (first) frame is the participant portrait.
        image.seek(0)
        image = ImageOps.exif_transpose(image)
        image.thumbnail((longest_edge, longest_edge), Image.Resampling.LANCZOS)
        # A fresh pixel-only image prevents camera, location, and editing metadata
        # from being copied into the app asset.
        clean = Image.new('RGB', image.size, (255, 255, 255))
        clean.paste(image.convert('RGB'))
        clean.save(destination, format='JPEG', quality=quality, optimize=True, progressive=True)
    with Image.open(destination) as saved:
        if saved.getexif() or max(saved.size) > longest_edge:
            raise ValueError(f'Prepared image failed privacy or size check: {destination}')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('manifest', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text())
    output = args.output.resolve()
    photos_root = Path(manifest['photosRoot']).resolve()
    if output == photos_root or photos_root in output.parents:
        raise ValueError('Output must be outside the original Photos folder')
    output.mkdir(mode=0o700, parents=False, exist_ok=False)
    (output / 'full').mkdir(mode=0o700)
    (output / 'thumb').mkdir(mode=0o700)
    results = []
    for entry in manifest['matched']:
        source = Path(entry['sourcePath']).resolve()
        if photos_root not in source.parents:
            raise ValueError(f'Source outside Photos folder: {source}')
        if sha256(source) != entry['sourceSha256']:
            raise ValueError(f'Source changed after audit: {source}')
        ftc_id = entry['ftcId']
        full = output / 'full' / f'{ftc_id}.jpg'
        thumb = output / 'thumb' / f'{ftc_id}.jpg'
        if full.exists() or thumb.exists():
            raise ValueError(f'Duplicate FTC ID in matched manifest: {ftc_id}')
        copy_for_app(source, full, 1280, 82)
        copy_for_app(source, thumb, 320, 78)
        results.append({
            'ftcId': ftc_id,
            'section': entry['section'],
            'sourceSha256': entry['sourceSha256'],
            'fullBytes': full.stat().st_size,
            'thumbBytes': thumb.stat().st_size,
        })
    (output / 'prepared-manifest.json').write_text(json.dumps(results, indent=2) + '\n')
    print(f'Prepared {len(results)} matched photos in {output}; originals unchanged.')
    print(f'Prepared bytes: {sum(r["fullBytes"] + r["thumbBytes"] for r in results):,}')


if __name__ == '__main__':
    main()
