'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function WarehouseReleaseRedirectPage() {
  const { id } = useParams();
  const router = useRouter();

  useEffect(() => {
    if (id) {
      router.replace(`/warehouse?process=${id}`);
    } else {
      router.replace('/warehouse');
    }
  }, [id, router]);

  return null;
}
