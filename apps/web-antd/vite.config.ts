import { defineConfig } from '@vben/vite-config';

export default defineConfig(async () => {
  return {
    application: { archiver: false, nitroMock: false, pwa: false },
    vite: {
      server: {
        proxy: {
          '/api/japangrad': {
            target: 'http://127.0.0.1:5667',
            changeOrigin: true,
          },
          '/api': {
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api/, ''),
            // mock代理目标地址
            target: 'http://localhost:5320/api',
            ws: true,
          },
        },
      },
    },
  };
});
