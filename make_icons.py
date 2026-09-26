"""Generates the extension's PNG icons (red rounded square, white play triangle).

Pure standard library, so no Pillow needed: python3 make_icons.py
"""
import struct
import zlib


def png(size):
    r = size * 0.2  # corner radius
    rows = []
    for y in range(size):
        row = bytearray([0])  # filter type: none
        for x in range(size):
            cx, cy = x + 0.5, y + 0.5
            # rounded-rectangle mask
            dx = max(r - cx, 0, cx - (size - r))
            dy = max(r - cy, 0, cy - (size - r))
            inside = dx * dx + dy * dy <= r * r
            # play triangle, pointing right
            tx0, tx1 = size * 0.38, size * 0.70
            half = (tx1 - tx0) * 0.6
            mid = size / 2
            in_tri = tx0 <= cx <= tx1 and abs(cy - mid) <= half * (tx1 - cx) / (tx1 - tx0)
            if not inside:
                row += bytes([0, 0, 0, 0])
            elif in_tri:
                row += bytes([255, 255, 255, 255])
            else:
                row += bytes([204, 0, 0, 255])
        rows.append(bytes(row))

    def chunk(kind, data):
        c = kind + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr)
            + chunk(b"IDAT", zlib.compress(b"".join(rows), 9)) + chunk(b"IEND", b""))


for s in (16, 32, 48, 128):
    with open(f"icons/icon{s}.png", "wb") as f:
        f.write(png(s))
