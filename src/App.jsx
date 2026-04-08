import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import Layout from './components/Layout';
import ULDOOverview from './pages/ULDOverview';
import QRNetReplacement from './pages/QRNetReplacement';
import Flights from './pages/Flights';
import Shipments from './pages/Shipments';
import ULDRegistration from './pages/ULDRegistration';
import ULDBuild from './pages/ULDBuild';
import ULDOverview from './pages/ULDOverview';
import LooseOverview from './pages/LooseOverview';
import Build from './pages/Build';
import PrintLabels from './pages/PrintLabels';
import LabelsToTerminal from './pages/LabelsToTerminal';
import DataMigration from './pages/DataMigration';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'config_error') {
      return (
        <div className="fixed inset-0 flex items-center justify-center p-6">
          <div className="max-w-lg rounded-xl border bg-card p-6 text-center shadow-sm">
            <h2 className="text-xl font-semibold">Microsoft login setup is incomplete</h2>
            <p className="mt-2 text-sm text-muted-foreground">{authError.message}</p>
            <p className="mt-2 text-xs text-muted-foreground">Add the Entra tenant/client settings to both the frontend and the API server, then refresh.</p>
          </div>
        </div>
      );
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<ULDOverview />} />

        <Route path="/flights" element={<Flights />} />
        <Route path="/shipments" element={<Shipments />} />
        <Route path="/qr-net-replacement" element={<QRNetReplacement />} />
        <Route path="/uld-registration" element={<ULDRegistration />} />
        <Route path="/uld-weighing" element={<ULDBuild />} />
        <Route path="/uld-overview" element={<ULDOverview />} />
        <Route path="/loose-overview" element={<LooseOverview />} />
        <Route path="/build" element={<Build />} />
        <Route path="/print-labels/:id" element={<PrintLabels />} />
        <Route path="/labels-to-terminal" element={<LabelsToTerminal />} />
        <Route path="/data-migration" element={<DataMigration />} />
        <Route path="*" element={<PageNotFound />} />
      </Route>
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App