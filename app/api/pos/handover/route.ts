import { buildAccountantHandover } from "@/backend/services/pos-handover"
export const dynamic="force-dynamic"
export async function GET(request:Request){
 try{const url=new URL(request.url),result=await buildAccountantHandover(url.searchParams.get('from')??'',url.searchParams.get('to')??'',url.searchParams.get('attachments')==='1')
 if(!result.success)return Response.json({error:result.error},{status:result.status,headers:{"Cache-Control":"private, no-store"}})
 let offset=0
 const stream=new ReadableStream<Uint8Array>({pull(controller){if(offset>=result.data.length){controller.close();return}const end=Math.min(offset+65536,result.data.length);controller.enqueue(new Uint8Array(result.data.subarray(offset,end)));offset=end}})
 return new Response(stream,{headers:{"Content-Type":"application/zip","Content-Disposition":`attachment; filename="${result.filename}"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}})
 }catch{return Response.json({error:"The handover pack could not be generated. Try a shorter range or check connectivity."},{status:503,headers:{"Cache-Control":"private, no-store"}})}
}
