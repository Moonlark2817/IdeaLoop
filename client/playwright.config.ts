import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
 testDir: './e2e', fullyParallel: false, workers: 1, timeout: 30000,
 use: {baseURL:'http://127.0.0.1:5174', trace:'retain-on-failure'},
 projects:[{name:'chromium',use:{...devices['Desktop Chrome'], channel:'chromium'}}],
 webServer:[
  {command:'node --import tsx src/tests/browserServer.ts',cwd:'..',url:'http://127.0.0.1:5001/api/health',reuseExistingServer:false},
  {command:'npm run dev -- --host 127.0.0.1 --port 5174 --strictPort',url:'http://127.0.0.1:5174',env:{API_PROXY_TARGET:'http://127.0.0.1:5001'},reuseExistingServer:false},
 ],
});
