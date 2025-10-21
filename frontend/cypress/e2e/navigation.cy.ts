describe('Navigation', () => {
  beforeEach(() => {
    cy.login('test@example.com', 'testpassword123');
  });

  it('should navigate between tabs', () => {
    // Should start on home page
    cy.url().should('include', '/home');

    // Navigate to restaurants
    cy.get('[data-testid="tab-restaurants"]').click();
    cy.url().should('include', '/restaurants');

    // Navigate to profile
    cy.get('[data-testid="tab-profile"]').click();
    cy.url().should('include', '/profile');

    // Navigate back to home
    cy.get('[data-testid="tab-home"]').click();
    cy.url().should('include', '/home');
  });

  it('should highlight active tab', () => {
    // Home tab should be active
    cy.get('[data-testid="tab-home"]').find('svg').should('have.class', 'text-blue-600');

    // Click restaurants tab
    cy.get('[data-testid="tab-restaurants"]').click();
    cy.get('[data-testid="tab-restaurants"]').find('svg').should('have.class', 'text-blue-600');

    // Click profile tab
    cy.get('[data-testid="tab-profile"]').click();
    cy.get('[data-testid="tab-profile"]').find('svg').should('have.class', 'text-blue-600');
  });

  it('should redirect to login when not authenticated', () => {
    cy.logout();

    // Try to visit protected route
    cy.visit('/restaurants');

    // Should redirect to login
    cy.url().should('eq', Cypress.config().baseUrl + '/');
  });
});
