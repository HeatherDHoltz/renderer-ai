"""Geometric narrow phase for the railcar audit (Blender mathutils only).

Contact along an edge is not a crossing. Coplanar patches need positive area.
All tolerances passed here are in authoring units, not metres.
"""
from mathutils import Vector


def _clip(poly, edge_a, edge_b, normal, eps):
    result = []
    side = lambda p: normal.dot((edge_b - edge_a).cross(p - edge_a))
    for p, q in zip(poly, poly[1:] + poly[:1]):
        dp, dq = side(p), side(q)
        if dp >= -eps:
            result.append(p)
        if (dp > eps and dq < -eps) or (dp < -eps and dq > eps):
            result.append(p + (q - p) * (dp / (dp - dq)))
    return result


def triangle_relation(a, b, epsilon=1e-5, plane_tolerance=0.001):
    """Return (kind, witness, area) or None; normals use evaluated winding.

    A proper crossing requires both triangles to straddle the other's plane
    and their plane-cut intervals to overlap. Near parallel, same-facing
    patches within plane_tolerance are z-fighting risks, not proof of flicker.
    """
    na, nb = (a[1] - a[0]).cross(a[2] - a[0]), (b[1] - b[0]).cross(b[2] - b[0])
    if min(na.length, nb.length) < epsilon * epsilon:
        return None
    na.normalize()
    nb.normalize()
    da = [nb.dot(v - b[0]) for v in a]
    db = [na.dot(v - a[0]) for v in b]
    alignment = na.dot(nb)
    if abs(alignment) > 0.999999 and max(abs(d) for d in da + db) <= plane_tolerance:
        # Project B onto A, then intersect the actual triangles in A's plane.
        projected = [v - na * na.dot(v - a[0]) for v in b]
        if alignment < 0:
            projected.reverse()
        poly = projected
        for p, q in zip(a, a[1:] + a[:1]):
            poly = _clip(poly, p, q, na, epsilon * epsilon)
            if len(poly) < 3:
                return None
        origin = poly[0]
        area = sum((poly[i] - origin).cross(poly[i + 1] - origin).length / 2
                   for i in range(1, len(poly) - 1))
        if area <= epsilon * epsilon:
            return None
        return ('same_facing_patch' if alignment > 0 else 'opposing_contact',
                sum(poly, Vector()) / len(poly), area)
    if not (min(da) < -epsilon and max(da) > epsilon
            and min(db) < -epsilon and max(db) > epsilon):
        return None
    direction = na.cross(nb).normalized()

    def cut(tri, distances):
        points = []
        for i, p in enumerate(tri):
            j = (i + 1) % 3
            if abs(distances[i]) <= epsilon:
                points.append(p)
            if distances[i] * distances[j] < 0:
                points.append(p + (tri[j] - p) * (distances[i] / (distances[i] - distances[j])))
        return points

    ca, cb = cut(a, da), cut(b, db)
    if not ca or not cb:
        return None
    lo = max(min(v.dot(direction) for v in ca), min(v.dot(direction) for v in cb))
    hi = min(max(v.dot(direction) for v in ca), max(v.dot(direction) for v in cb))
    if hi - lo <= epsilon:
        return None
    point = ca[0] + direction * ((lo + hi) / 2 - ca[0].dot(direction))
    return 'surface_crossing', point, 0.0
