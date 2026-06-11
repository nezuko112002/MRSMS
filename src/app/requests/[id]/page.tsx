'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function RequestDetailRedirectPage() {
  const { id } = useParams();
  const router = useRouter();

  useEffect(() => {
    if (id) {
      router.replace(`/requests?view=${id}`);
    } else {
      router.replace('/requests');
    }
  }, [id, router]);

  return null;
}
