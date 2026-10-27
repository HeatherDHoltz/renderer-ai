import { assetStream } from "./asset-stream.js";

// Gzip transport preserves the packaged GLB. Delivery preparation may already
// have externalized/resized its images; geometry/UV data stays intact.
export async function loadRoomAsset(loader, url) {
  let asset;
  if (!/\.glb\.gz(?:\.parts\.json)?$/.test(String(url))) asset=await loader.loadAsync(url);
  else {
    const stream = await assetStream(url);
    const bytes = await new Response(stream.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
    asset=await loader.parseAsync(bytes, new URL(".", url).href);
  }
  for(const [texture,association] of asset.parser.associations) {
    if(!texture.isTexture || association.textures===undefined)continue;
    const def=asset.parser.json.textures[association.textures];
    const source=def.extensions?.EXT_texture_webp?.source ?? def.source;
    const image=asset.parser.json.images[source];
    if(image.uri && !image.uri.startsWith('data:'))texture.userData.deliveryURL=new URL(image.uri,url).href;
  }
  return asset;
}
