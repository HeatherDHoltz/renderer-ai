import { assetStream } from "./asset-stream.js";
import { decodeResponse } from "./response-codec.js";

self.onmessage = async ({data:{id,url}}) => {
  try {
    const stream = await assetStream(url);
    const bytes = await new Response(stream.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
    const {width,height,pixels} = decodeResponse(bytes);
    self.postMessage({id,width,height,pixels}, [pixels.buffer]);
  } catch (error) {
    self.postMessage({id,error:error.message});
  }
};
self.postMessage({ready:true});
