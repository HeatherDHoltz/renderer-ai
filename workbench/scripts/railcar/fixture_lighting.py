"""Repair light placement/transmission on an authored railcar copy.

Does not rebuild or move mesh geometry. Run on a copy; compare in Cycles before
baking. Thin-glass shadow transmission is an explicit transport approximation.
"""
import json

def apply():
    import bpy
    from mathutils import Vector
    s=bpy.context.scene
    if s.get('railcar_readable_lighting') or any(o.type=='LIGHT' and ' visible bulb ' in o.name for o in s.objects):
        raise ValueError('Readable fixture lighting already applied; start from the recorded source')
    report={'source':bpy.data.filepath,'changes':[]}
    def shadow_transmission(name,color):
     m=bpy.data.materials[name];nt=m.node_tree;out=next(n for n in nt.nodes if n.type=='OUTPUT_MATERIAL');old=out.inputs['Surface'].links[0].from_socket
     lp=nt.nodes.new('ShaderNodeLightPath');tr=nt.nodes.new('ShaderNodeBsdfTransparent');tr.inputs[0].default_value=(*color,1)
     mix=nt.nodes.new('ShaderNodeMixShader');nt.links.new(lp.outputs['Is Shadow Ray'],mix.inputs[0]);nt.links.new(old,mix.inputs[1]);nt.links.new(tr.outputs[0],mix.inputs[2]);nt.links.new(mix.outputs[0],out.inputs['Surface'])
     report['changes'].append({'material':name,'shadowTransmission':color,'approximation':'thin glass shadow transmission; camera material retained'})
    # Light sources stay at visible fixture bulbs. The old single center source was
    # inside the opaque chandelier body, below the actual bulbs.
    for o in list(s.objects):
     if o.type!='MESH' or not o.name.startswith('Chandelier_02'):continue
     slots=[m.name if m else '' for m in o.data.materials]
     ids={p.material_index for p in o.data.polygons if 'bulb' in slots[p.material_index]}
     vs={v for p in o.data.polygons if p.material_index in ids for v in p.vertices};neighbors={v:set() for v in vs}
     for p in o.data.polygons:
      if p.material_index in ids:
       for a in p.vertices:neighbors[a].update(p.vertices)
     centers=[];remaining=set(vs)
     while remaining:
      pending=[remaining.pop()];group=[]
      while pending:
       a=pending.pop();group.append(a);n=neighbors[a]&remaining;remaining-=n;pending.extend(n)
      pts=[o.matrix_world@o.data.vertices[v].co for v in group]
      if len(pts)>5:centers.append(sum(pts,Vector())/len(pts))
     oldname='gasolier light '+str(['Chandelier_02','Chandelier_02.001','Chandelier_02.002'].index(o.name));old=bpy.data.objects[oldname];old.hide_render=True
     for i,c in enumerate(centers):
      l=bpy.data.lights.new(o.name+' visible bulb '+str(i),'POINT');l.energy=270/len(centers);l.color=(1,.78,.55);l.shadow_soft_size=.07
      ob=bpy.data.objects.new(l.name,l);old.users_collection[0].objects.link(ob);ob.location=c;ob.visible_camera=False;ob.visible_glossy=True
     for mi in ids:
      m=o.data.materials[mi];p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');p.inputs['Emission Color'].default_value=(1,.78,.55,1);p.inputs['Emission Strength'].default_value=3
      shadow_transmission(m.name,(.9,.86,.8))
     report['changes'].append({'fixture':o.name,'oldPower':old.data.energy,'newTotalPower':270,'bulbPositions':[list(c) for c in centers]})
    shadow_transmission('rc etched tulip glass',(.78,.74,.67))
    # Apply the thin-glass shadow approximation only to the student-lamp chimney.
    chimney=bpy.data.objects['student lamp chimney']
    chimney.data=chimney.data.copy();clear=chimney.data.materials[0].copy();clear.name='student chimney — clear light transmission';chimney.data.materials[0]=clear
    shadow_transmission(clear.name,(.94,.96,.98))
    corner=bpy.data.objects['sconce back 2 flame 0'];report['changes'].append({'light':corner.name,'before':corner.data.energy,'after':360});corner.data.energy=360
    # Restore moderate room bounce; leave shelf/picture lights reduced so bookcase
    # wood does not dominate the adjacent panelling.
    for n in s.world.node_tree.nodes:
     if n.type=='BACKGROUND':report['changes'].append({'worldBefore':n.inputs['Strength'].default_value,'worldAfter':.07});n.inputs['Strength'].default_value=.07
    s['railcar_readable_lighting']=1
    return report
