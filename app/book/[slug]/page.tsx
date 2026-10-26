import { notFound } from "next/navigation"
import { getPublicBookingOptions } from "@/backend/actions/pos-online-booking"
import { OnlineBooking } from "@/frontend/components/online-booking"
export const dynamic="force-dynamic"
export const metadata={title:"Book an appointment | MySaji",robots:{index:false,follow:false}}
export default async function BookingPage({params}:{params:Promise<{slug:string}>}){
 const {slug}=await params,result=await getPublicBookingOptions(slug)
 if(!result.success)notFound()
 return <OnlineBooking key={slug} slug={slug} options={result.data}/>
}
