"""The smallest study the shell can run: one grey channel, and the pixels brighter than a threshold.
It exists for the shell's tests, so it uses every part of the contract and nothing else, not even a
package: it reads 8-bit greyscale PNGs itself."""
import json
import struct
import zlib


def ready():
    return json.dumps(dict(threshold=128))


def read_png(data):
    """(width, height, pixels) of an 8-bit greyscale, non-interlaced PNG."""
    if data[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError('not a PNG')
    at, idat = 8, b''
    while at < len(data):
        n, kind = struct.unpack('>I4s', data[at:at + 8])
        body = data[at + 8:at + 8 + n]
        if kind == b'IHDR':
            W, H, depth, colour, _, _, interlace = struct.unpack('>IIBBBBB', body)
            if (depth, colour, interlace) != (8, 0, 0):
                raise ValueError('only 8-bit greyscale, non-interlaced PNGs')
        elif kind == b'IDAT':
            idat += body
        at += 12 + n
    raw, out, prev = zlib.decompress(idat), bytearray(), bytearray(W)
    for y in range(H):
        f, row = raw[y * (W + 1)], bytearray(raw[y * (W + 1) + 1:(y + 1) * (W + 1)])
        for x in range(W):
            a, b, c = row[x - 1] if x else 0, prev[x], prev[x - 1] if x else 0
            p = a + b - c
            pred = (0, a, b, (a + b) // 2, a if abs(p - a) <= abs(p - b) and abs(p - a) <= abs(p - c) else b if abs(p - b) <= abs(p - c) else c)[f]
            row[x] = (row[x] + pred) & 255
        out += row; prev = row
    return W, H, bytes(out)


class Session:
    def __init__(self, path):
        with open(path, 'rb') as f:
            self.W, self.H, self.px = read_png(f.read())

    def opened(self):
        return json.dumps(dict(H=self.H, W=self.W, um=None, um_y=None, info=[['Pixels', f'{self.W} × {self.H}']])), self.px

    def call(self, action, args):
        if action == 'count':
            above = bytes(1 if v > args['threshold'] else 0 for v in self.px)
            return json.dumps(dict(count=sum(above))), above
        raise ValueError(f'unknown action {action!r}')
