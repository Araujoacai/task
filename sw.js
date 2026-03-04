const CACHE_NAME = 'app-alerta-v3';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './firebase-config.js',
    './ai-parser.js',
    './manifest.json',
    './icon-192.svg',
    './icon-512.svg'
];

// Instalação do Service Worker e cache dos recursos iniciais
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('Cache aberto');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// Ativação e limpeza de caches antigos
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Limpando cache antigo', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Interceptação das requisições (estratégia Cache First, Network Fallback)
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            // Retorna o arquivo em cache, ou faz a requisição na rede
            return response || fetch(event.request);
        }).catch(() => {
            // Fallback em caso de falha de conexão e sem cache
            if (event.request.mode === 'navigate') {
                return caches.match('./index.html');
            }
        })
    );
});
