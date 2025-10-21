describe('Authentication', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('should display login form', () => {
    cy.get('[data-testid="login-title"]').should('be.visible');
    cy.get('[data-testid="login-email"]').should('be.visible');
    cy.get('[data-testid="login-password"]').should('be.visible');
    cy.get('[data-testid="login-submit"]').should('be.visible');
  });

  it('should show error on invalid credentials', () => {
    cy.get('[data-testid="login-email"]').type('invalid@example.com');
    cy.get('[data-testid="login-password"]').type('wrongpassword');
    cy.get('[data-testid="login-submit"]').click();

    cy.contains('Invalid email or password').should('be.visible');
  });

  it('should successfully login with valid credentials', () => {
    // Note: You'll need to have a test user created in your PocketBase instance
    // For example: test@example.com / testpassword123
    cy.get('[data-testid="login-email"]').type('test@example.com');
    cy.get('[data-testid="login-password"]').type('testpassword123');
    cy.get('[data-testid="login-submit"]').click();

    cy.url().should('include', '/home');
    cy.get('[data-testid="bottom-tab-navigation"]').should('be.visible');
  });

  it('should logout successfully', () => {
    // Login first
    cy.login('test@example.com', 'testpassword123');

    // Logout
    cy.logout();

    // Should be back on login page
    cy.get('[data-testid="login-title"]').should('be.visible');
  });
});
