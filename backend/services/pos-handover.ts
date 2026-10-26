import "server-only"
import { db } from "@/backend/db"
import { resolvePosActor } from "@/backend/services/pos-access-core"
import { salonDay } from "@/backend/domain/pos-salon"
import { storedZip,csvArchiveFile } from "@/backend/domain/pos-handover"
export async function buildAccountantHandover(fromDay:string,toDay:string,attachments:boolean){
 const actor=await resolvePosActor();if(!actor?.shopkeeperId||!actor.can("report.sales")||!actor.can("expense.view"))return {success:false as const,status:403,error:"Sales reports and expense access are required."}
 if(attachments&&!actor.can("purchase.view"))return {success:false as const,status:403,error:"Purchase access is required to include original invoices."}
 const from=salonDay(fromDay),to=salonDay(toDay)
 if(!from||!to||to<from||+to-+from>92*86400000||+to>Date.now())return {success:false as const,status:400,error:"Choose a valid range of up to 93 days ending today or earlier, in East Africa Time."}
 const shopkeeperId=actor.shopkeeperId,range={gte:from,lt:new Date(+to+86400000)},limit=10001
 const [shop,sales,refunds,expenses,shifts,receipts,invoices,usage,bookingDeposits]=await Promise.all([
  db.shopkeeperProfile.findUnique({where:{id:shopkeeperId},select:{shopName:true}}),
  db.posSale.findMany({where:{shopkeeperId,occurredAt:range},include:{payments:true,items:{select:{id:true,name:true,quantity:true,totalPrice:true,costAtSale:true}}},orderBy:{occurredAt:"asc"},take:limit}),
  db.posReturn.findMany({where:{shopkeeperId,occurredAt:range},orderBy:{occurredAt:"asc"},take:limit}),
  db.posExpense.findMany({where:{shopkeeperId,occurredAt:range},orderBy:{occurredAt:"asc"},take:limit}),
  db.tillSession.findMany({where:{shopkeeperId,closedAt:range},orderBy:{closedAt:"asc"},take:limit}),
  db.posGoodsReceipt.findMany({where:{shopkeeperId,occurredAt:range},orderBy:{occurredAt:"asc"},take:limit}),
  actor.can("purchase.view")?db.posInvoiceDraft.findMany({where:{shopkeeperId,status:"RECEIVED",updatedAt:range},select:{id:true,receiptId:true,fileName:true,mimeType:true,sourceHash:true,...(attachments?{sourceBase64:true}:{})},take:201}):[],
  actor.can("report.margin")?db.posMaterialUsage.findMany({where:{shopkeeperId,postedAt:range},select:{id:true,contextType:true,contextId:true,status:true,postedAt:true,lines:true},take:limit}):[],
  db.posMpesaTransaction.findMany({where:{shopkeeperId,accountReference:{startsWith:"BOOKING:"},confirmedAt:range,status:"PAID"},select:{id:true,receipt:true,amount:true,confirmedAt:true,consumedSaleId:true,accountReference:true},take:limit}),
 ])
 if([sales,refunds,expenses,shifts,receipts,usage,bookingDeposits].some(r=>r.length>=limit)||invoices.length>200)return {success:false as const,status:413,error:"This export exceeds the record/document limits. Choose a shorter period; incomplete accounting packs are not exported."}
 const warnings:unknown[][]=[]
 for(const sale of sales){const missing=sale.items.filter(i=>i.costAtSale===null).length;if(missing)warnings.push(['MISSING_COST',sale.saleNumber,`${missing} lines lack a historical cost`]);if(sale.payments.some(p=>p.method==="MPESA"&&!p.stkConfirmed))warnings.push(['PAYMENT_REVIEW',sale.saleNumber,'M-Pesa tender is recorded but not marked STK-confirmed; review merchant payment records'])}
 for(const expense of expenses)if(!expense.reference)warnings.push(['MISSING_SUPPORT',expense.id,'Expense has no reference; request its supporting document'])
 for(const receipt of receipts)if(!invoices.some(i=>i.receiptId===receipt.id))warnings.push(['NO_CAPTURED_INVOICE',receipt.receiptNumber,'No captured invoice in this export; obtain the original separately'])
 const n=(value:unknown)=>value==null?null:Number(value),files=[
 csvArchiveFile('sales.csv',['receipt','occurred_at','status','subtotal','discount','vat_recorded','total','balance_due','cashier'],sales.map(s=>[s.saleNumber,s.occurredAt.toISOString(),s.status,n(s.subtotal),n(s.discount),n(s.tax),n(s.total),n(s.balanceDue),s.cashierName])),
 csvArchiveFile('tenders.csv',['receipt','method','amount','reference','stk_confirmed'],sales.flatMap(s=>s.payments.map(p=>[s.saleNumber,p.method,n(p.amount),p.reference,p.stkConfirmed]))),
 csvArchiveFile('refunds.csv',['return','occurred_at','original_sale_id','amount','method','reason'],refunds.map(r=>[r.returnNumber,r.occurredAt.toISOString(),r.saleId,n(r.totalRefunded),r.method,r.reason])),
 csvArchiveFile('expenses.csv',['id','occurred_at','category','description','amount','payee','method','reference','voided_at'],expenses.map(e=>[e.id,e.occurredAt.toISOString(),e.category,e.description,n(e.amount),e.payee,e.paidWith,e.reference,e.voidedAt?.toISOString()])),
 csvArchiveFile('cash_drawers.csv',['id','closed_at','cashier','opening_float','expected','counted','difference'],shifts.map(s=>[s.id,s.closedAt?.toISOString(),s.cashierName,n(s.openingFloat),n(s.expectedCash),n(s.countedCash),n(s.variance)])),
 csvArchiveFile('goods_receipts.csv',['receipt','occurred_at','supplier_id','supplier_reference','cost_recorded','received_by'],receipts.map(r=>[r.receiptNumber,r.occurredAt.toISOString(),r.supplierId,r.supplierRef,n(r.totalCost),r.receivedByName])),
 csvArchiveFile('booking_deposits.csv',['id','confirmed_at','booking_reference','mpesa_receipt','amount','applied_sale_id'],bookingDeposits.map(p=>[p.id,p.confirmedAt?.toISOString(),p.accountReference,p.receipt,n(p.amount),p.consumedSaleId])),
 csvArchiveFile('invoice_index.csv',['draft_id','goods_receipt_id','original_filename','sha256'],invoices.map(i=>[i.id,i.receiptId,i.fileName,i.sourceHash])),
 csvArchiveFile('review_exceptions.csv',['kind','record','review_note'],warnings),
 ]
 if(actor.can("report.margin"))files.push(csvArchiveFile('costed_sales_lines.csv',['receipt','line_id','item','quantity','line_total','historical_unit_cost'],sales.flatMap(s=>s.items.map(i=>[s.saleNumber,i.id,i.name,Number(i.quantity),Number(i.totalPrice),i.costAtSale===null?null:Number(i.costAtSale)]))))
 if(actor.can("report.margin"))files.push(csvArchiveFile('service_material_usage.csv',['usage_id','posted_at','context','context_id','status','snapshots_json'],usage.map(u=>[u.id,u.postedAt.toISOString(),u.contextType,u.contextId,u.status,JSON.stringify(u.lines)])))
 let total=0
 if(attachments)for(const invoice of invoices){const raw='sourceBase64' in invoice&&typeof invoice.sourceBase64==="string"?invoice.sourceBase64:"";const data=Buffer.from(raw,'base64');total+=data.length;if(total>20*1024*1024)return {success:false as const,status:413,error:"Original invoices exceed 20 MB. Export a shorter period or exclude attachments."};const extension=invoice.mimeType==="application/pdf"?'pdf':invoice.mimeType==="image/png"?'png':invoice.mimeType==="image/webp"?'webp':'jpg';files.push({name:`invoices/${invoice.id}.${extension}`,data})}
 const text=`Saji Till accountant handover\nBusiness: ${shop?.shopName??actor.businessName}\nBranch: ${shopkeeperId}\nPeriod: ${fromDay} through ${toDay}, inclusive EAT\nGenerated: ${new Date().toISOString()}\n\nThis pack contains recorded data, not an audited statement or tax filing.\nSales, tenders, refunds, deposits and expenses are separate; do not add them together as revenue. Parked/voided sales remain labelled. Booking deposits must be matched to their final sale and must not be counted twice. VAT amounts are recorded configuration, not proof of eTIMS submission. An expense is not proof of a drawer withdrawal. Missing documents/costs are listed in review_exceptions.csv. Cash differences are counted less expected. Data can change after this export through traceable corrections.\nOriginal invoices: ${attachments?'included where captured':'not included'}. Originals not captured in Till must be obtained separately.\n`
 files.unshift({name:'READ_ME.txt',data:new TextEncoder().encode(text)})
 return {success:true as const,data:storedZip(files),filename:`till-handover-${fromDay}-${toDay}.zip`}
}
