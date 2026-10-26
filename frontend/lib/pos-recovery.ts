import type { QueuedSale } from "@/frontend/lib/pos-offline"
const encode=(bytes:Uint8Array)=>{let text="";for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text)}
const decode=(value:string)=>{if(!/^[A-Za-z0-9+/]+={0,2}$/.test(value)||value.length%4)throw Error("Invalid backup encoding.");return Uint8Array.from(atob(value),c=>c.charCodeAt(0))}
async function key(password:string,salt:Uint8Array<ArrayBuffer>){
 if(password.length<12||password.length>200)throw Error("Use a recovery passphrase of 12 to 200 characters.")
 const material=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveKey"])
 return crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:250000,hash:"SHA-256"},material,{name:"AES-GCM",length:256},false,["encrypt","decrypt"])
}
export async function encryptTillBackup(scope:{userId:string;shopId:string},entries:QueuedSale[],password:string){
 const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12))
 const bytes=new TextEncoder().encode(JSON.stringify({version:1,scope,generatedAt:new Date().toISOString(),entries}))
 if(bytes.length>10*1024*1024)throw Error("This queue exceeds the 10 MB recovery limit. Contact support before clearing any data.")
 const cipher=await crypto.subtle.encrypt({name:"AES-GCM",iv},await key(password,salt),bytes)
 return JSON.stringify({format:"saji-till-recovery",version:1,salt:encode(salt),iv:encode(iv),ciphertext:encode(new Uint8Array(cipher))})
}
function record(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==="object"&&!Array.isArray(value)}
export async function decryptTillBackup(text:string,password:string,expected:{userId:string;shopId:string}):Promise<QueuedSale[]>{
 if(text.length>15*1024*1024)throw Error("This recovery file is too large.")
 const file:unknown=JSON.parse(text)
 if(!record(file)||file.format!=="saji-till-recovery"||file.version!==1||typeof file.salt!=="string"||typeof file.iv!=="string"||typeof file.ciphertext!=="string"||file.salt.length>32||file.iv.length>24)throw Error("Use an encrypted Saji Till recovery file.")
 const salt=decode(file.salt),iv=decode(file.iv);if(salt.length!==16||iv.length!==12)throw Error("Invalid recovery file.")
 let plain:ArrayBuffer
 try{plain=await crypto.subtle.decrypt({name:"AES-GCM",iv},await key(password,salt),decode(file.ciphertext))}catch{throw Error("The passphrase is incorrect or the recovery file was changed.")}
 const parsed:unknown=JSON.parse(new TextDecoder().decode(plain))
 if(!record(parsed)||!record(parsed.scope)||parsed.scope.userId!==expected.userId||parsed.scope.shopId!==expected.shopId||!Array.isArray(parsed.entries)||parsed.entries.length>10000)throw Error("This backup belongs to another account/branch or has too many entries.")
 const keys=new Set<string>(),entries:QueuedSale[]=[]
 for(const item of parsed.entries){
  if(!record(item)||typeof item.key!=="string"||item.key.length>100||keys.has(item.key)||!record(item.payload)||item.payload.idempotencyKey!==item.key||item.payload.expectedShopId!==expected.shopId||item.payload.expectedUserId!==expected.userId||!record(item.summary)||typeof item.summary.total!=="number"||!Number.isFinite(item.summary.total)||item.summary.total<0||typeof item.summary.itemCount!=="number"||!Number.isInteger(item.summary.itemCount)||item.summary.itemCount<1||typeof item.summary.occurredAt!=="string"||!Number.isFinite(Date.parse(item.summary.occurredAt)))throw Error("A recovery entry is invalid or belongs to another account/branch.")
  keys.add(item.key);entries.push({key:item.key,payload:item.payload,summary:{total:item.summary.total,itemCount:item.summary.itemCount,occurredAt:item.summary.occurredAt},createdAt:typeof item.createdAt==="string"?item.createdAt:item.summary.occurredAt,status:"pending",attempts:0,lastError:null})
 }
 return entries
}
