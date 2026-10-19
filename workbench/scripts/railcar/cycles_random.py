"""Cycles' non-instance Object Info random value, preserved across mesh merges.

Compatibility references: Blender intern/cycles/blender/object.cpp and
intern/cycles/util/hash.h. The integer finalizer is Bob Jenkins' public-domain
lookup3 algorithm; this module does not assign a license to the repository.
"""
MASK = 0xFFFFFFFF


def object_random(name):
    name_hash = 0
    for value in name.encode('utf-8'):
        name_hash = (name_hash * 37 + (value if value < 128 else value - 256)) & MASK
    a = (0xDEADBEEF + 21 + name_hash) & MASK
    b = c = (0xDEADBEEF + 21) & MASK
    def rotate(x, n):
        return ((x << n) | (x >> (32 - n))) & MASK
    c = ((c ^ b) - rotate(b, 14)) & MASK
    a = ((a ^ c) - rotate(c, 11)) & MASK
    b = ((b ^ a) - rotate(a, 25)) & MASK
    c = ((c ^ b) - rotate(b, 16)) & MASK
    a = ((a ^ c) - rotate(c, 4)) & MASK
    b = ((b ^ a) - rotate(a, 14)) & MASK
    c = ((c ^ b) - rotate(b, 24)) & MASK
    # Cycles converts the integer to single precision before normalization.
    import struct
    def f32(x):
        return struct.unpack('<f', struct.pack('<f', x))[0]
    return f32(f32(c) * f32(1.0 / f32(MASK)))
