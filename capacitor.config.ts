import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'ke.co.smartdev.app',
  appName: 'SmartDev',
  webDir: 'dist/client',
  server: {
    url: 'https://smartdev.xco.ke',
    cleartext: false
  }
};
export default config;
