// Benchmark script for Push Notification delivery

const { performance } = require('perf_hooks');

// Mock Data
const SUBSCRIPTION_COUNT = 100; // Number of subscriptions to simulate
const MOCK_LATENCY_MS = 50;     // Simulated network latency per request

const subs = Array.from({ length: SUBSCRIPTION_COUNT }, (_, i) => ({
    endpoint: `https://fcm.googleapis.com/fcm/send/${i}`,
    p256dh: 'mock-p256dh',
    auth: 'mock-auth'
}));

const payload = JSON.stringify({
    title: 'Dream X',
    body: 'Benchmark Test',
    url: '/',
    icon: '/img/icon-192x192.png',
    badge: '/img/badge-72x72.png'
});

// Mock webpush
const webpush = {
    sendNotification: async (sub, payload) => {
        return new Promise(resolve => setTimeout(resolve, MOCK_LATENCY_MS));
    }
};

async function runSerial() {
    const start = performance.now();
    for (const s of subs) {
        try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
        } catch (err) {
            // Error handling ignored for benchmark
        }
    }
    const end = performance.now();
    return end - start;
}

async function runConcurrent() {
    const start = performance.now();
    const promises = subs.map(s =>
        webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
            .catch(err => {
                 // Error handling logic would go here
            })
    );
    await Promise.all(promises);
    const end = performance.now();
    return end - start;
}

async function runBenchmark() {
    console.log(`Running Benchmark with ${SUBSCRIPTION_COUNT} subscriptions and ${MOCK_LATENCY_MS}ms latency...`);

    console.log('Running Serial...');
    const serialTime = await runSerial();
    console.log(`Serial Execution Time: ${serialTime.toFixed(2)}ms`);

    console.log('Running Concurrent...');
    const concurrentTime = await runConcurrent();
    console.log(`Concurrent Execution Time: ${concurrentTime.toFixed(2)}ms`);

    const improvement = serialTime / concurrentTime;
    console.log(`Speedup: ${improvement.toFixed(2)}x`);
}

runBenchmark();
