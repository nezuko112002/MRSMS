import { redirect } from 'next/navigation';

// /warehouse/release redirects to the warehouse queue
export default function WarehouseReleasePage() {
  redirect('/warehouse');
}
