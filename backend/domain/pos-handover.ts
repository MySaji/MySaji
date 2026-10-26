import { toCsv } from "@/backend/domain/pos-operations"
/** Small, dependency-free ZIP writer using stored entries and CRC32. */
export function storedZip(files:{name:string;data:Uint8Array}[]):Uint8Array{
 const at=new Date(),dosDate=((Math.max(1980,Math.min(2107,at.getUTCFullYear()))-1980)<<9)|((at.getUTCMonth()+1)<<5)|at.getUTCDate(),dosTime=(at.getUTCHours()<<11)|(at.getUTCMinutes()<<5)|Math.floor(at.getUTCSeconds()/2)
 const encoder=new TextEncoder(),parts:Uint8Array[]=[],central:Uint8Array[]=[];let offset=0,centralSize=0
 const crc=(data:Uint8Array)=>{let c=0xffffffff;for(const b of data){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0)}return (c^0xffffffff)>>>0}
 for(const file of files){if(!/^[A-Za-z0-9_./-]+$/.test(file.name)||file.name.includes('..')||file.name.startsWith('/'))throw Error('Unsafe archive name');const name=encoder.encode(file.name),check=crc(file.data)
  const header=new Uint8Array(30+name.length),h=new DataView(header.buffer);h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x800,true);h.setUint16(10,dosTime,true);h.setUint16(12,dosDate,true);h.setUint32(14,check,true);h.setUint32(18,file.data.length,true);h.setUint32(22,file.data.length,true);h.setUint16(26,name.length,true);header.set(name,30);parts.push(header,file.data)
  const entry=new Uint8Array(46+name.length),c=new DataView(entry.buffer);c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);c.setUint16(12,dosTime,true);c.setUint16(14,dosDate,true);c.setUint32(16,check,true);c.setUint32(20,file.data.length,true);c.setUint32(24,file.data.length,true);c.setUint16(28,name.length,true);c.setUint32(42,offset,true);entry.set(name,46);central.push(entry);centralSize+=entry.length;offset+=header.length+file.data.length
 }
 const end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,centralSize,true);e.setUint32(16,offset,true)
 const output=new Uint8Array(offset+centralSize+22);let cursor=0;for(const part of [...parts,...central,end]){output.set(part,cursor);cursor+=part.length}return output
}
export function csvArchiveFile(name:string,headers:string[],rows:unknown[][]){return {name,data:new TextEncoder().encode(toCsv(headers,rows))}}
