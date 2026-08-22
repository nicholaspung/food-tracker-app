describe('lazy screen registry', () => {
  it('registers heavyweight routes without evaluating their screen modules', () => {
    const loaders = new Map<string, () => Promise<unknown>>();
    const billModuleEvaluated = jest.fn();

    jest.isolateModules(() => {
      jest.doMock('../navigation/LazyScreen', () => ({
        createLazyScreen: (screenName: string, load: () => Promise<unknown>) => {
          loaders.set(screenName, load);
          return () => null;
        },
      }));
      jest.doMock('../screens/BillsScreen', () => {
        billModuleEvaluated();
        return {
          BillsScreen: () => null,
        };
      });
      jest.requireActual('../navigation/lazyScreens');
    });

    expect([...loaders.keys()]).toEqual([
      'QRScanner',
      'Tutorials',
      'TastingSessions',
      'CreateTastingSession',
      'JoinTastingSession',
      'TastingSessionLobby',
      'TastingSessionPlanning',
      'TastingSessionTasting',
      'TastingSessionResults',
      'Bills',
      'CreateBill',
      'ReceiptScan',
      'BillDetail',
      'TipCalculator',
    ]);
    expect(billModuleEvaluated).not.toHaveBeenCalled();
  });
});
