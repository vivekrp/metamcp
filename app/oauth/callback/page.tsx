'use client';

import { Suspense } from 'react';

import OAuthCallback from '@/components/OAuthCallback';

export default function OAuthCallbackPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <OAuthCallback />
        </Suspense>
    );
}
