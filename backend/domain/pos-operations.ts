import { z } from "zod"
import { salonDay } from "./pos-salon"

export const operationsSettingsSchema=z.object({
 bookingEnabled:z.boolean().default(false),publicStaffIds:z.array(z.string().min(1).max(60)).max(50).default([]),
 weekdays:z.array(z.number().int().min(0).max(6)).min(1).max(7).default([1,2,3,4,5,6]),
 opens:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default("09:00"),closes:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default("18:00"),
 noticeHours:z.number().int().min(1).max(168).default(2),cancellationHours:z.number().int().min(0).max(168).default(24),
 depositAmount:z.number().int().min(0).max(100000).default(0),cancellationPolicy:z.string().trim().max(800).default("Contact the business about cancellations and any deposit refund. Refunds are reviewed by the business; cancellation does not automatically refund a payment."),
}).refine(s=>s.opens<s.closes,{message:"Closing time must be after opening time."})
export type OperationsSettings=z.infer<typeof operationsSettingsSchema>
export function readOperationsSettings(raw:unknown):OperationsSettings {const r=operationsSettingsSchema.safeParse(raw??{});return r.success?r.data:operationsSettingsSchema.parse({})}
export function bookingSlots(day:string,duration:number,settings:OperationsSettings,busy:{startsAt:Date;endsAt:Date}[],now=new Date()){
 const start=salonDay(day);if(!start||!settings.weekdays.includes(new Date(+start+10800000).getUTCDay()))return []
 const minutes=(s:string)=>Number(s.slice(0,2))*60+Number(s.slice(3))
 const slots:string[]=[]
 for(let m=minutes(settings.opens);m+duration<=minutes(settings.closes);m+=30){const date=new Date(+start+m*60000),end=new Date(+date+duration*60000);if(+date<+now+settings.noticeHours*3600000||busy.some(b=>b.startsAt<end&&b.endsAt>date))continue;slots.push(date.toISOString())}
 return slots
}
export const invoiceExtractSchema=z.object({supplier:z.string().max(160).default(""),reference:z.string().max(80).default(""),currency:z.string().max(10).default("KES"),invoiceDate:z.string().max(20).default(""),total:z.number().nonnegative().max(1e9).nullable().default(null),warnings:z.array(z.string().max(200)).max(10).default([]),lines:z.array(z.object({description:z.string().trim().min(1).max(160),quantity:z.number().positive().max(1e6).nullable(),unitCost:z.number().nonnegative().max(1e7).nullable(),unit:z.string().max(30).default(""),confidence:z.enum(["high","low"]).default("low")})).min(1).max(100)})
export type ExtractedInvoice=z.infer<typeof invoiceExtractSchema>
export const invoiceReviewSchema=z.object({supplierId:z.string().min(1).max(60),reference:z.string().trim().min(1).max(60),lines:z.array(z.object({productId:z.string().min(1).max(60),variantId:z.string().min(1).max(60).optional(),quantity:z.number().positive().max(1e6).multipleOf(0.001),unitCost:z.number().nonnegative().max(1e7).multipleOf(0.01),batchNumber:z.string().max(60).optional(),expiryDate:z.string().datetime().optional()})).min(1).max(100),reviewed:z.literal(true)}).refine(r=>r.lines.reduce((sum,line)=>sum+line.quantity*line.unitCost,0)<=1000000000,{message:"Reviewed invoice stock cost cannot exceed KSh 1 billion."})
export function parseInvoiceFile(dataUrl:string){
 if(dataUrl.length>4200000)return null
 const m=/^data:(image\/(?:jpeg|png|webp)|application\/pdf);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl)
 if(!m||m[2].length%4)return null
 const b=Buffer.from(m[2],"base64");if(b.length>3*1024*1024||b.toString('base64')!==m[2])return null
 const valid=m[1]==="application/pdf"?b.subarray(0,5).toString()==="%PDF-":m[1]==="image/jpeg"?b[0]===255&&b[1]===216&&b[2]===255:m[1]==="image/png"?b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):b.toString('ascii',0,4)==="RIFF"&&b.toString('ascii',8,12)==="WEBP"
 return valid?{mimeType:m[1],data:m[2],bytes:b}:null
}
export const materialLineSchema=z.object({productId:z.string().min(1).max(60),variantId:z.string().min(1).max(60).nullable().default(null),batchId:z.string().min(1).max(60).nullable().default(null),quantity:z.number().positive().max(100000).multipleOf(0.001)})
export const materialSnapshotSchema=z.array(materialLineSchema.extend({name:z.string(),unit:z.string(),unitCost:z.string().nullable()})).min(1).max(50)
export function expiryActionAllowed(action:string,expired:boolean,restricted:boolean){return action!=="MARKDOWN"||(!expired&&!restricted)}
export function csvCell(value:unknown){if(typeof value==="number")return Number.isFinite(value)?String(value):"";let s=String(value??"");if(/^[\s]*[=+\-@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'}
export function toCsv(headers:string[],rows:unknown[][]){return '\uFEFF'+[headers,...rows].map(r=>r.map(csvCell).join(',')).join('\r\n')}
