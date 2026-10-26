import { CustomerSalonBookings } from "@/frontend/components/customer-salon-bookings"
export const metadata={title:"My salon appointments | MySaji",robots:{index:false,follow:false}}
export default async function MyBookingsPage({searchParams}:{searchParams:Promise<{business?:string}>}){
 const params=await searchParams
 return <div className="mx-auto w-full max-w-5xl space-y-5 p-4 md:p-8"><header><h1 className="text-3xl font-semibold">Salon appointments</h1><p className="mt-3 text-sm text-muted-foreground">Manage your online bookings, deposit status and consenting cancellation waitlists.</p></header><CustomerSalonBookings slug={typeof params.business==='string'?params.business:''}/></div>
}
