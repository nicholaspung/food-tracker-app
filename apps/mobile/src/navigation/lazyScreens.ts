import { createLazyScreen } from './LazyScreen';

export const QRScannerScreen = createLazyScreen('QRScanner', () =>
  import('../screens/QRScannerScreen').then(({ QRScannerScreen }) => ({ default: QRScannerScreen })),
);
export const TutorialsScreen = createLazyScreen('Tutorials', () =>
  import('../screens/TutorialsScreen').then(({ TutorialsScreen }) => ({ default: TutorialsScreen })),
);

export const TastingSessionsScreen = createLazyScreen('TastingSessions', () =>
  import('../screens/TastingSessionsScreen').then(({ TastingSessionsScreen }) => ({
    default: TastingSessionsScreen,
  })),
);
export const CreateTastingSessionScreen = createLazyScreen('CreateTastingSession', () =>
  import('../screens/CreateTastingSessionScreen').then(({ CreateTastingSessionScreen }) => ({
    default: CreateTastingSessionScreen,
  })),
);
export const JoinTastingSessionScreen = createLazyScreen('JoinTastingSession', () =>
  import('../screens/JoinTastingSessionScreen').then(({ JoinTastingSessionScreen }) => ({
    default: JoinTastingSessionScreen,
  })),
);
export const TastingSessionLobbyScreen = createLazyScreen('TastingSessionLobby', () =>
  import('../screens/TastingSessionLobbyScreen').then(({ TastingSessionLobbyScreen }) => ({
    default: TastingSessionLobbyScreen,
  })),
);
export const TastingSessionPlanningScreen = createLazyScreen('TastingSessionPlanning', () =>
  import('../screens/TastingSessionPlanningScreen').then(({ TastingSessionPlanningScreen }) => ({
    default: TastingSessionPlanningScreen,
  })),
);
export const TastingSessionTastingScreen = createLazyScreen('TastingSessionTasting', () =>
  import('../screens/TastingSessionTastingScreen').then(({ TastingSessionTastingScreen }) => ({
    default: TastingSessionTastingScreen,
  })),
);
export const TastingSessionResultsScreen = createLazyScreen('TastingSessionResults', () =>
  import('../screens/TastingSessionResultsScreen').then(({ TastingSessionResultsScreen }) => ({
    default: TastingSessionResultsScreen,
  })),
);

export const BillsScreen = createLazyScreen('Bills', () =>
  import('../screens/BillsScreen').then(({ BillsScreen }) => ({ default: BillsScreen })),
);
export const CreateBillScreen = createLazyScreen('CreateBill', () =>
  import('../screens/CreateBillScreen').then(({ CreateBillScreen }) => ({ default: CreateBillScreen })),
);
export const ReceiptScanScreen = createLazyScreen('ReceiptScan', () =>
  import('../screens/ReceiptScanScreen').then(({ ReceiptScanScreen }) => ({ default: ReceiptScanScreen })),
);
export const BillDetailScreen = createLazyScreen('BillDetail', () =>
  import('../screens/BillDetailScreen').then(({ BillDetailScreen }) => ({ default: BillDetailScreen })),
);
export const TipCalculatorScreen = createLazyScreen('TipCalculator', () =>
  import('../screens/TipCalculatorScreen').then(({ TipCalculatorScreen }) => ({ default: TipCalculatorScreen })),
);
