/// <reference types="cypress" />

// Custom command to login
Cypress.Commands.add('login', (email: string, password: string) => {
  cy.visit('/');
  cy.get('[data-testid="login-email"]').type(email);
  cy.get('[data-testid="login-password"]').type(password);
  cy.get('[data-testid="login-submit"]').click();
  cy.url().should('include', '/home');
});

// Custom command to logout
Cypress.Commands.add('logout', () => {
  cy.get('[data-testid="tab-profile"]').click();
  cy.get('[data-testid="logout-btn"]').click();
  cy.url().should('eq', Cypress.config().baseUrl + '/');
});

declare global {
  namespace Cypress {
    interface Chainable {
      login(email: string, password: string): Chainable<void>;
      logout(): Chainable<void>;
    }
  }
}

export {};
