// src/App.tsx
import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import {
  IonApp,
  IonIcon,
  IonLabel,
  IonRouterOutlet,
  IonTabBar,
  IonTabButton,
  IonTabs,
  setupIonicReact
} from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { cartOutline, cubeOutline, statsChartOutline } from 'ionicons/icons';

/* Core Pages */
import { POSPage } from './pages/POSPage';
import { InventoryPage } from './pages/InventoryPage';
import { DashboardPage } from './pages/DashboardPage';

/* Core CSS required for Ionic components to work properly */
import '@ionic/react/css/core.css';

/* Basic CSS for apps built with Ionic */
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';

/* Optional CSS utils that can be commented out */
import '@ionic/react/css/padding.css';
import '@ionic/react/css/float-elements.css';
import '@ionic/react/css/text-alignment.css';
import '@ionic/react/css/text-transformation.css';
import '@ionic/react/css/flex-utils.css';
import '@ionic/react/css/display.css';

/* Theme variables */
import './theme/variables.css';

setupIonicReact({
  mode: 'md' // Forces clean, fast Material Design styling across both Android and Web
});

const App: React.FC = () => {
  return (
    <IonApp>
      <IonReactRouter>
        <IonTabs>
          <IonRouterOutlet>
            <Routes>
              {/* POS Screen */}
              <Route path="/pos" element={<POSPage />} />

              {/* Inventory Management Screen */}
              <Route path="/inventory" element={<InventoryPage />} />

              {/* Sales & Low Stock Dashboard */}
              <Route path="/dashboard" element={<DashboardPage />} />

              {/* DEFAULT ROUTE: Launching app automatically redirects to /pos */}
              <Route path="/" element={<Navigate to="/pos" replace />} />
            </Routes>
          </IonRouterOutlet>

          {/* Bottom Navigation Bar */}
          <IonTabBar slot="bottom">
            <IonTabButton tab="pos" href="/pos">
              <IonIcon aria-hidden="true" icon={cartOutline} />
              <IonLabel>POS / Benta</IonLabel>
            </IonTabButton>

            <IonTabButton tab="inventory" href="/inventory">
              <IonIcon aria-hidden="true" icon={cubeOutline} />
              <IonLabel>Imbentaryo</IonLabel>
            </IonTabButton>

            <IonTabButton tab="dashboard" href="/dashboard">
              <IonIcon aria-hidden="true" icon={statsChartOutline} />
              <IonLabel>Ulat (Sales)</IonLabel>
            </IonTabButton>
          </IonTabBar>
        </IonTabs>
      </IonReactRouter>
    </IonApp>
  );
};

export default App;