import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sarisari.pos',
  appName: '5M Sari-Sari Store',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    BarcodeScanner: {
      autoUpdateModel: true
    }
  }
};

export default config;