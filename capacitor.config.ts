import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'ke.co.smartdev.app',
  appName: 'SmartDev',
  webDir: 'dist/client',
  android: {
    allowMixedContent: false,
  },
};
export default config;
