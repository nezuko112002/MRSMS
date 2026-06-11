'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function ConfirmationDetailRedirectPage() {
  const { id } = useParams();
  const router = useRouter();

  useEffect(() => {
    if (id) {
      router.replace(`/confirmations?confirm=${id}`);
    } else {
      router.replace('/confirmations');
    }
  }, [id, router]);

  return null;
}
