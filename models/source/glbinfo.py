import json, struct, sys
for f in sys.argv[1:]:
    b = open(f, 'rb').read()
    L = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + L])
    img = {im.get('name'): j['bufferViews'][im['bufferView']]['byteLength'] // 1024 for im in j.get('images', [])}
    tot = sum(bv['byteLength'] for bv in j['bufferViews'])
    nv = sum(j['accessors'][p['attributes']['POSITION']]['count'] for m in j['meshes'] for p in m['primitives'])
    attrs = sorted({a for m in j['meshes'] for p in m['primitives'] for a in p['attributes']})
    print(f, len(b) // 1024, 'KB | geometry', (tot - sum(img.values()) * 1024) // 1024, 'KB', nv, 'verts', attrs, '| images', img, '| nodes', [n.get('name') for n in j['nodes']])
