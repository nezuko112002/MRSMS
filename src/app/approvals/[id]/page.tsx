'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function ApprovalReviewRedirectPage() {
  const { id } = useParams();
  const router = useRouter();

  useEffect(() => {
    if (id) {
      router.replace(`/approvals?review=${id}`);
    } else {
      router.replace('/approvals');
    }
  }, [id, router]);

  return null;
}
