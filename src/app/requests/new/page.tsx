'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function NewRequestRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/requests?new=1');
  }, [router]);

  return null;
}
